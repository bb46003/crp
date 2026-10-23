// module/crp.mjs

import { CRPActor } from "./actor/actor.mjs";
import { CRPActorData, CRPNPCKnechtData, CRPNPCRycerzData } from "./actor/actor-data.mjs";
import { CRP } from "./config.mjs";
import { CRPRoll } from "./rolls/roll.mjs";
import { CRPActorSheet } from "./actor/actor-sheet.mjs";
import { CRPNPCCommonerSheet } from "./actor/npc-commoner-sheet.mjs";
import { CRPNPCKnechtSheet } from "./actor/npc-knecht-sheet.mjs";
import { CRPNPCRycerzSheet } from "./actor/npc-rycerz-sheet.mjs";
import { CRPGMPanel } from "./gm-panel.mjs";
import { CRPItem } from "./item/item.mjs";
import { CRPWeaponData, CRPArmorData, CRPShieldData, CRPStuffData, CRPLanguageData, CRPOriginData, CRPTraitData } from "./item/item-data.mjs";
import { CRPWeaponSheet, CRPArmorSheet, CRPShieldSheet, CRPStuffSheet, CRPLanguageSheet, CRPOriginSheet, CRPTraitSheet } from "./item/item-sheet.mjs";
import { CRPCombat } from "./combat.mjs";
import { registerHandlebarsHelpers } from "./handlebars.mjs";

const CRP_MOUNT_UNDERLAY = "systems/crp/assets/wierzchowiec.webp";
const CRP_PENDING_INITIATIVE_UPDATES = new Map();

function hasChangedPath(changed, path) {
  return foundry.utils.hasProperty(changed, path) || Object.hasOwn(changed, path);
}


function getInitiativeTotal(actor) {
  return Number(actor?.system?.derived?.initiativeTotal ?? actor?.system?.derived?.initiative ?? 0);
}

async function refreshCombatInitiativeForActor(actor, previousBase = null) {
  const combat = game.combat;
  if (!combat || !actor) return;

  const currentBase = getInitiativeTotal(actor);

  for (const combatant of combat.combatants) {
    if (combatant.actor?.id !== actor.id || combatant.initiative === null) continue;

    const storedRoll = combatant.getFlag("crp", "initiativeRoll");
    let initiative = null;

    if (Number.isFinite(storedRoll)) {
      initiative = currentBase + storedRoll;
    } else if (Number.isFinite(previousBase)) {
      initiative = combatant.initiative - previousBase + currentBase;
    }

    if (initiative === null || initiative === combatant.initiative) continue;

    await combat.setInitiative(combatant.id, initiative);
  }
}



async function flushPendingCombatInitiatives(combat) {
  if (!game.user.isGM || !combat?.started || !CRP_PENDING_INITIATIVE_UPDATES.size) return;

  const pending = Array.from(CRP_PENDING_INITIATIVE_UPDATES.entries());
  CRP_PENDING_INITIATIVE_UPDATES.clear();

  for (const [actorUuid, previousBase] of pending) {
    let actor = combat.combatants.find(c => c.actor?.uuid === actorUuid)?.actor;
    actor ??= await fromUuid(actorUuid);
    if (!actor) continue;

    await refreshCombatInitiativeForActor(actor, previousBase);
  }
}

async function clearCombatManeuverFlags(combat) {
  if (!game.user.isGM || !combat) return;

  const actors = [
    ...new Set(
      combat.combatants
        .map(combatant => combatant.actor)
        .filter(Boolean)
    )
  ];

  await Promise.all(
    actors.flatMap(actor => [
      actor.unsetFlag("crp", "aimedAttack"),
      actor.unsetFlag("crp", "defensiveAttack")
    ])
  );
}

function renderDamageControls({ messageId, defenderUuid, damage, hasFate, resolved = false, status = "" } = {}) {
  const disabled = resolved || !hasFate ? "disabled" : "";
  const note = status || (!hasFate ? "Brak Doli - obrażenia przyjęte automatycznie." : "Obrońca może przyjąć albo anulować obrażenia wydając punkt Doli.");

  return `
<!-- CRP_DAMAGE_CONTROL_START -->
  <div class="crp-damage-control"
       data-message-id="${messageId}"
       data-defender="${defenderUuid}"
       data-damage="${damage}">
    <button type="button"
            class="crp-damage-choice"
            data-action="accept"
            data-message-id="${messageId}"
            data-defender="${defenderUuid}"
            data-damage="${damage}"
            ${disabled}>
      Przyjmij obrażenia
    </button>
    <button type="button"
            class="crp-damage-choice"
            data-action="cancel"
            data-message-id="${messageId}"
            data-defender="${defenderUuid}"
            data-damage="${damage}"
            ${disabled}>
      Anuluj obrażenia
    </button>
    <div class="crp-damage-status">${note}</div>
  </div>
<!-- CRP_DAMAGE_CONTROL_END -->
`;
}

async function applyPendingDamageChoice(defender, { messageId, damage, action } = {}) {
  if (!defender) return null;

  const resolvedDamage = foundry.utils.deepClone(defender.getFlag("crp", "resolvedDamage") ?? {});
  if (messageId && resolvedDamage[messageId]) return null;

  const amount = Math.max(0, Number(damage) || 0);
  let status = "";

  if (action === "cancel") {
    const spent = await defender.spendFate(1);

    if (spent) {
      status = "Obrażenia anulowane kosztem 1 Doli.";
    } else {
      await defender.applyDamage(amount);
      status = "Brak Doli - obrażenia przyjęte.";
      action = "accept";
    }
  } else {
    await defender.applyDamage(amount);
    status = "Obrażenia przyjęte.";
    action = "accept";
  }

  if (messageId) {
    resolvedDamage[messageId] = {
      action,
      damage: amount,
      status,
      userId: game.user.id,
      time: Date.now()
    };

    await defender.setFlag("crp", "resolvedDamage", resolvedDamage);
  }

  defender.sheet?.render(false);

  return { action, amount, status };
}

async function updateDamageMessage({ messageId, defenderUuid, action, amount, status } = {}) {
  const msg = game.messages.get(messageId);
  if (!msg) return false;

  await msg.setFlag("crp", "damageResolved", {
    action,
    defenderUuid,
    damage: amount
  });

  const replacement = renderDamageControls({
    messageId,
    defenderUuid,
    damage: amount,
    hasFate: false,
    resolved: true,
    status
  });

  const content = msg.content.replace(
    /<!-- CRP_DAMAGE_CONTROL_START -->[\s\S]*?<!-- CRP_DAMAGE_CONTROL_END -->/,
    replacement
  );

  await msg.update({ content });

  return true;
}

async function resolvePendingDamage({ messageId, defenderUuid, damage, action } = {}) {
  const defender = await fromUuid(defenderUuid);
  const result = await applyPendingDamageChoice(defender, { messageId, damage, action });
  if (!result) return false;

  try {
    await updateDamageMessage({
      messageId,
      defenderUuid,
      action: result.action,
      amount: result.amount,
      status: result.status
    });
  } catch (err) {
    console.warn("CRP | Nie udało się zaktualizować wiadomości obrażeń", err);
  }

  return result;
}

function canUserResolveDamage(defender, user) {
  if (!defender || !user) return false;
  if (user.isGM) return true;

  const candidates = [
    defender,
    defender.baseActor,
    defender.token?.baseActor,
    defender.token?.actor,
    game.actors.get(defender.id)
  ].filter(Boolean);

  return candidates.some(actor => actor.testUserPermission?.(user, "OWNER"));
}

function removeMountedTokenUnderlay(token) {
  if (!token?._crpMountUnderlay) return;

  token._crpMountUnderlay.destroy({ children: true });
  token._crpMountUnderlay = null;
}

async function refreshMountedTokenUnderlay(token) {

  const mounted = !!token?.actor?.system?.equipment?.mounted;

  if (!mounted) {
    removeMountedTokenUnderlay(token);
    return;
  }

  if (!canvas?.ready || !token?.mesh?.parent) return;

  let sprite = token._crpMountUnderlay;

  // jeśli sprite istnieje → NIE robimy async ani nie tworzymy nowego
  if (!sprite || sprite.destroyed) {

    const texture = await foundry.canvas.loadTexture(CRP_MOUNT_UNDERLAY);
    if (!texture) return;

    sprite = PIXI.Sprite.from(texture);
    sprite.name = "crp-mounted-underlay";
    sprite.eventMode = "none";
    sprite.interactive = false;

    token._crpMountUnderlay = sprite;

    for (const child of token.mesh.parent.children) {
    if (child.name === "crp-mounted-underlay" && child !== sprite) {
      child.destroy();
    }
  }
  }

  const parent = token.mesh.parent;

  // upewnij się że jest tylko jeden sprite
  if (sprite.parent && sprite.parent !== parent) {
    sprite.parent.removeChild(sprite);
  }

  if (!sprite.parent) {
    const meshIndex = parent.getChildIndex(token.mesh);

    parent.addChildAt(sprite, Math.max(0, meshIndex));
  }

  // update pozycji – TERAZ bez laga
  sprite.position.copyFrom(token.mesh.position);

  const { width, height } = token.document.getSize();

  sprite.anchor.set(0.5);
  sprite.width = width * 1.45;
  sprite.height = height * 1.45;

  // lepiej brać z document (bez glitchy przy rotacji)
  sprite.angle = token.document.rotation ?? 0;
  sprite.alpha = token.document.alpha ?? 1;
  sprite.visible = token.mesh.visible !== false;

  // pilnuj kolejności warstw
  const meshIndex = parent.getChildIndex(token.mesh);
  const spriteIndex = parent.getChildIndex(sprite);

  if (spriteIndex > meshIndex) {
    parent.setChildIndex(sprite, Math.max(0, meshIndex));
  }
}



function refreshMountedActorUnderlays(actor) {
  const tokens = getMountedActorTokens(actor);

  for (const token of tokens) {
    refreshMountedTokenUnderlay(token);
  }
}
function getMountedActorTokens(actor) {
  const tokens = new Set(actor?.getActiveTokens?.(false) ?? []);

  if (!canvas?.ready) return [...tokens];

  for (const token of canvas.tokens?.placeables ?? []) {
    const tokenActor = token.actor;
    const matchesActor =
      tokenActor === actor ||
      tokenActor?.uuid === actor?.uuid ||
      tokenActor?.id === actor?.id ||
      token.document?.actorId === actor?.id;

    if (matchesActor) tokens.add(token);
  }

  return [...tokens];
}
function refreshCharacterSheetLocks(locked) {
  for (const sheet of document.querySelectorAll(".crp-sheet")) {
    sheet.querySelectorAll(
      ".crp-attr-value, .crp-skill-value, .crp-pd-value"
    ).forEach(input => {
      input.disabled = locked;
    });
  }

  for (const actor of game.actors?.contents ?? []) {
    actor.sheet?.render(false);
  }
}

Hooks.once("init", () => {
  game.settings.register("crp", "characterSheetsLocked", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: refreshCharacterSheetLocks
  });

  // NAJPIERW MODELE ITEMÓW (PRZED WSZYSTKIM)
  CONFIG.Item = CONFIG.Item || {};
  CONFIG.Item.documentClass = CRPItem;

  CONFIG.Item.dataModels = {
    weapon: CRPWeaponData,
    armor: CRPArmorData,
    shield: CRPShieldData,
    stuff: CRPStuffData,
    language: CRPLanguageData,
    origin: CRPOriginData,
    trait: CRPTraitData,
    flaw: CRPTraitData
  };

  CONFIG.Actor.documentClass = CRPActor;

  CONFIG.Actor.dataModels = {
    character: CRPActorData,
    npc: CRPActorData,
    "npc-knecht": CRPNPCKnechtData,
    "npc-rycerz": CRPNPCRycerzData,
    creature: CRPActorData
  };

  CONFIG.CRP = CRP;
  CONFIG.Combat.documentClass = CRPCombat;
  foundry.documents.collections.Actors.registerSheet("crp", CRPActorSheet, {
  types: ["character"],
  makeDefault: true
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCCommonerSheet, {
  types: ["npc"],
  makeDefault: true
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCKnechtSheet, {
  types: ["npc-knecht"],
  makeDefault: true
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCRycerzSheet, {
  types: ["npc-rycerz"],
  makeDefault: true
  });

foundry.documents.collections.Items.registerSheet("crp", CRPWeaponSheet, {
  types: ["weapon"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPArmorSheet, {
  types: ["armor"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPShieldSheet, {
  types: ["shield"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPStuffSheet, {
  types: ["stuff"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPLanguageSheet, {
  types: ["language"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPOriginSheet, {
  types: ["origin"],
  makeDefault: true
});

foundry.documents.collections.Items.registerSheet("crp", CRPTraitSheet, {
  types: ["trait", "flaw"],
  makeDefault: true
});

CONFIG.Combat = CONFIG.Combat || {};

// ======================
// OVERRIDE INITIATIVE ROLL
// ======================

CONFIG.Combat.initiative = {
  formula: "1d6",
  decimals: 0
};
registerHandlebarsHelpers();
Combat.prototype.rollInitiative = async function(ids, options = {}) {

  ids = typeof ids === "string" ? [ids] : ids;

  for (const id of ids) {

    const combatant = this.combatants.get(id);
    if (!combatant) continue;

    const actor = combatant.actor;
    if (!actor) continue;

    // NASZ SYSTEM
    await CRPRoll.initiative(actor, { combatant });

  }

  return this;
};

});

Hooks.on("updateItem", async (item, changed) => {
  if (
    ["armor", "shield"].includes(item.type) &&
    item.parent?.documentName === "Actor" &&
    hasChangedPath(changed, "system.protection")
  ) {
    item.parent.sheet?.render(false);
  }

  if (
    item.type !== "origin" ||
    item.parent?.documentName !== "Actor" ||
    item.parent.system.bio?.origin?.id !== item.id ||
    !hasChangedPath(changed, "system.language")
  ) {
    return;
  }

  const actorSheet = item.parent.sheet;
  if (typeof actorSheet?._assignOriginLanguage !== "function") return;

  await actorSheet._assignOriginLanguage(item);
  actorSheet.render(false);
});


Hooks.on("canvasReady", () => {
  for (const token of canvas.tokens?.placeables ?? []) {
    refreshMountedTokenUnderlay(token);
  }
});

Hooks.on("drawToken", token => {
  refreshMountedTokenUnderlay(token);
});

Hooks.on("refreshToken", token => {
  refreshMountedTokenUnderlay(token);
});

Hooks.on("deleteToken", tokenDocument => {
  removeMountedTokenUnderlay(tokenDocument?.object);
});

Hooks.on("crpMountedChanged", actor => {
  refreshMountedActorUnderlays(actor);
});

Hooks.on("updateToken", (tokenDocument, changed) => {
  const mountedChanged = [
    "actorData.system.equipment.mounted",
    "delta.system.equipment.mounted",
    "system.equipment.mounted"
  ].some(path => hasChangedPath(changed, path));

  if (mountedChanged) refreshMountedTokenUnderlay(tokenDocument?.object);
});


Hooks.on("renderChatMessageHTML", (message, html) => {

  const buttons = html.querySelectorAll(".crp-use-fate");
  if (!buttons.length) return;

  for (const button of buttons) {

    //  zabezpieczenie przed wielokrotnym bindem
    if (button.dataset.bound) continue;
    button.dataset.bound = "true";

    button.addEventListener("click", async ev => {

      ev.preventDefault();
      ev.stopPropagation();

      //  jeśli już użyto
      if (button.classList.contains("used")) return;

      button.disabled = true;
      button.innerText = "⏳ Rzut...";

      const actorUuid = button.dataset.actorUuid;
      const attrKey = button.dataset.attr;
      const skillKey = button.dataset.skill;
      const modifier = Number(button.dataset.modifier) || 0;

      if (!actorUuid) {
        ui.notifications.error("Brak UUID aktora");
        button.disabled = false;
        button.innerText = "✨ Użyj Doli";
        return;
      }

      const actor = await fromUuid(actorUuid);

      if (!actor || (!actor.isOwner && !game.user.isGM)) {
        ui.notifications.error("Brak uprawnień do aktora");
        button.disabled = false;
        button.innerText = "✨ Użyj Doli";
        return;
      }

      //  zużycie Doli
      let spent;
      try {
        spent = await actor.spendFate(1);
      } catch (e) {
        console.error(e);
        ui.notifications.error("Błąd Doli");
        button.disabled = false;
        button.innerText = "✨ Użyj Doli";
        return;
      }

      if (!spent) {
        button.disabled = false;
        button.innerText = "✨ Użyj Doli";
        return;
      }

      //  reroll (bez nowej wiadomości)
let result;

  result = await CRPRoll.skill(actor, attrKey, skillKey, {
    chat: false,
    modifier,
    displayModifier: modifier
  });



      if (!result) {
        button.disabled = false;
        button.innerText = "✨ Użyj Doli";
        return;
      }

      //  generujemy nowy HTML
const newContent = CRPRoll.renderRollHTML(
  
  actor,
  attrKey,
  skillKey,
  result,
  {
    usedFate: true,
    allowFate: false
  }
);

      //  KLUCZ: aktualizujemy TĘ wiadomość
      await message.update({
        content: newContent
      });

      button.innerText = "✔ Dola użyta";
button.classList.add("used");
button.disabled = true;

    });

  }

});

Hooks.on("renderChatMessageHTML", (message, html) => {

  const buttons = html.querySelectorAll(".crp-damage-choice");
  if (!buttons.length) return;

  for (const button of buttons) {
    if (button.dataset.bound) continue;
    button.dataset.bound = "true";

    const defenderUuid = button.dataset.defender;
    const defender = typeof fromUuidSync === "function" ? fromUuidSync(defenderUuid) : null;
    const canResolve = canUserResolveDamage(defender, game.user);

    if (!canResolve || message.getFlag("crp", "damageResolved")) {
      button.disabled = true;
    }

    button.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      if (button.disabled) return;

      const data = {
        type: "damageChoice",
        requestId: foundry.utils.randomID(),
        messageId: button.dataset.messageId,
        defenderUuid,
        damage: Number(button.dataset.damage) || 0,
        action: button.dataset.action,
        userId: game.user.id
      };

      const choices = Array.from(html.querySelectorAll(".crp-damage-choice"));
      for (const choice of html.querySelectorAll(".crp-damage-choice")) {
        choice.disabled = true;
      }

      try {
        const resolved = await resolvePendingDamage(data);

        if (!resolved) {
          for (const choice of choices) choice.disabled = false;
          ui.notifications.warn("Te obrażenia zostały już rozliczone albo nie można znaleźć postaci.");
          return;
        }

        const control = button.closest(".crp-damage-control");
        if (control) {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = renderDamageControls({
            messageId: data.messageId,
            defenderUuid,
            damage: resolved.amount,
            hasFate: false,
            resolved: true,
            status: resolved.status
          }).trim();

          control.replaceWith(wrapper.firstElementChild);
        }

        if (!game.user.isGM) {
          game.socket.emit("system.crp", {
            ...data,
            type: "damageChoiceSync"
          });
        }
      } catch (err) {
        console.error("CRP | Błąd rozliczania obrażeń", err);
        for (const choice of choices) choice.disabled = false;
        ui.notifications.error("Nie udało się rozliczyć obrażeń.");
      }
    });
  }
});

Handlebars.registerHelper("eq", (a, b) => a === b);


Hooks.on("updateCombat", async (combat, changed) => {

  if (changed.started === false) {
    await clearCombatManeuverFlags(combat);
    return;
  }

  if (!combat.started || (changed.turn === undefined && changed.round === undefined)) return;

  if (changed.round !== undefined) {
    await flushPendingCombatInitiatives(combat);
  }

  // RESET FLAG
if (game.user.isGM) {
  await Promise.all(
    combat.combatants
      .map(c => c.actor)
      .filter(Boolean)
      .map(actor => actor.setFlag("crp", "processedTurn", false))
  );
}

  // AKTUALNY COMBATANT
  const combatant = combat.combatant;
  if (!combatant) return;

  const actor = combatant.actor;

  if (game.user.isGM && actor) {
    for (const flagName of ["aimedAttack", "defensiveAttack"]) {
      const maneuver = actor.getFlag("crp", flagName);

      if (
        maneuver?.combatId === combat.id &&
        maneuver?.combatantId === combatant.id &&
        combat.round >= maneuver.expiresRound
      ) {
        await actor.unsetFlag("crp", flagName);
      }
    }
  }

  if (!actor) return;

  if (actor.type !== "character") return;

  await CRPRoll.processTurn(actor);
});

Hooks.on("deleteCombat", async (combat) => {
  await clearCombatManeuverFlags(combat);
});


Hooks.on("renderActorDirectory", (app, html) => {

  if (!game.user.isGM) return;

  if (html.querySelector(".crp-btn")) return;

  const btn = document.createElement("button");
  btn.innerHTML = "👑 CRP Panel";
  btn.classList.add("crp-btn");

  btn.addEventListener("click", () => {
    new CRPGMPanel().render(true);
  });

  html.querySelector(".directory-header").appendChild(btn);

});

Hooks.on("renderChatMessageHTML", (message, html) => {

  const buttons = html.querySelectorAll(".crp-defense-choice button");

// BLOKADA PAROWANIA W UI (RUNTIME)
for (const btn of buttons) {
  const container = btn.closest(".crp-defense-choice");
const itemType = container.dataset.itemType;
const range = container.dataset.range;
const defenderMounted = container.dataset.defenderMounted === "true";

  if (btn.dataset.defense !== "parry") continue;

if (itemType === "unarmed") {
  btn.disabled = false;
  continue;
}

if (range === "ranged") {
  btn.disabled = true;
}
}

if (!buttons.length) return;

for (const btn of buttons) {

  if (btn.dataset.bound) continue;
  btn.dataset.bound = "true";

  btn.addEventListener("click", async ev => {

    const container = btn.closest(".crp-defense-choice");
    const messageId = container.dataset.messageId;

    const attackerUuid = container.dataset.attacker;
    const defenderUuid = container.dataset.defender;
    const defenseType = btn.dataset.defense;
    const skill = container.dataset.skill;
const itemType = container.dataset.itemType;
const range = container.dataset.range;
const attackModifier = Number(container.dataset.attackModifier) || 0;
const selectedAttackModifier = Number(container.dataset.selectedAttackModifier) || 0;
const attackerMounted = container.dataset.attackerMounted === "true";
const defenderMounted = container.dataset.defenderMounted === "true";

    const attacker = await fromUuid(attackerUuid);
    const defender = await fromUuid(defenderUuid);

    if (!attacker || !defender) return;

    //  uprawnienia
    const isGM = game.user.isGM;
    const ownsDefender = defender.isOwner;

    if (!isGM && !ownsDefender) {
      ui.notifications.warn("Nie kontrolujesz tej postaci");
      return;
    }

    let defSkill;
    const mountedDefenseModifier = defenderMounted && !attackerMounted ? 2 : 0;
    let defenseModifier = mountedDefenseModifier;

    const getCombatModifier = ({ item = null, skill = null, unarmed = false } = {}) => {
      if (unarmed) return -3;
      if (!item || item.type !== "weapon") return 0;
      if (item.system.range === "ranged" || skill === "ranged") return 2;
      if (skill === "lightWeapons") return -1;
      if (skill === "twoHanded") return 3;
      return 1;
    };

    if (defenseType === "parry") {

  // BLOKADA PAROWANIA VS RANGED
  if (itemType === "weapon" && range === "ranged") {
    ui.notifications.warn("Nie można parować ataku dystansowego");
    return;
  }

  const eq = defender.system.equipment;

  const getTotal = (skill) => {
    if (!skill) return -999;

    const attr = defender._mapSkillToAttribute(skill);
    if (!attr) return -999;

    const attrVal = defender.system.attributes[attr]?.value ?? 0;
    const skillVal = defender.system.attributes[attr]?.skills?.[skill]?.value ?? 0;

    return attrVal + skillVal;
  };

const getParryCandidate = (slot) => {
  const id = eq[slot]?.id;
  if (!id) return null;

  const item = defender.items.get(id);
  if (!item) return null;

  // tylko broń
  if (item.type !== "weapon") return null;

  // broń dystansowa nie paruje
  if (item.system.range === "ranged") return null;

  return {
    skill: item.system.skill,
    modifier: getCombatModifier({ item, skill: item.system.skill })
  };
};

const parryCandidates = [
  getParryCandidate("rightHand"),
  getParryCandidate("leftHand")
].filter(Boolean);

  if (itemType === "unarmed") {
    const hasEmptyHand = !eq.rightHand?.id || !eq.leftHand?.id;

    if (hasEmptyHand) {
      parryCandidates.push({
        skill: "brawl",
        modifier: getCombatModifier({ unarmed: true })
      });
    }

    const best = parryCandidates
      .sort((a, b) => (getTotal(b.skill) + b.modifier) - (getTotal(a.skill) + a.modifier))[0];

    defSkill = best?.skill;
    defenseModifier = mountedDefenseModifier + (best?.modifier ?? 0);

    if (!defSkill) {
      ui.notifications.warn("Brak wolnej ręki lub broni do parowania");
      return;
    }
  } else {
    const best = parryCandidates
      .sort((a, b) => (getTotal(b.skill) + b.modifier) - (getTotal(a.skill) + a.modifier))[0];

    if (!best) {
      ui.notifications.warn("Brak broni do parowania");
      return;
    }

    defSkill = best.skill;
    defenseModifier = mountedDefenseModifier + best.modifier;
  }
}
    if (defenseType === "dodge") {
      defSkill = "athletics";
      defenseModifier = defenderMounted ? -2 : mountedDefenseModifier;
    }
    
    if (defenseType === "shield") {

  const eq = defender.system.equipment;

  const right = eq.rightHand?.id
    ? defender.items.get(eq.rightHand.id)
    : null;

  const left = eq.leftHand?.id
    ? defender.items.get(eq.leftHand.id)
    : null;

  const hasShield =
    right?.type === "shield" ||
    left?.type === "shield";

  if (!hasShield) {
    ui.notifications.warn("Brak tarczy");
    return;
  }

  defSkill = "shield";
  defenseModifier = mountedDefenseModifier + 1;
}

const combat = game.combat;
const combatant = combat?.combatants.find(combatant => combatant.actor?.id === defender.id);
const defensiveAttack = defender.getFlag("crp", "defensiveAttack");
const defensiveAttackBonus =
  defensiveAttack?.oneTime
    ? Number(defensiveAttack.bonus) || 3
    : combat?.started &&
      defensiveAttack?.combatId === combat.id &&
      defensiveAttack?.combatantId === combatant?.id
      ? Number(defensiveAttack.bonus) || 3
      : 0;

if (defensiveAttackBonus) {
  defenseModifier += defensiveAttackBonus;

  if (defensiveAttack.oneTime) {
    await defender.unsetFlag("crp", "defensiveAttack");
  }
}

const result = await attacker.opposedTest(
  defender,
  attacker._mapSkillToAttribute(skill),
  skill,
  defender._mapSkillToAttribute(defSkill),
  defSkill,
  {
    actorAOptions: {
      modifier: attackModifier,
      displayModifier: selectedAttackModifier
    },
    actorBOptions: {
      modifier: defenseModifier,
      displayModifier: defenseType === "dodge" && defenderMounted ? -2 : null
    }
  }
);

// =====================
// OBRAŻENIA
// =====================
if (result?.winner === "A") {

  const marginA = result.rollA?.margin ?? 0;
  const marginB = result.rollB?.margin ?? 0;

const baseDamage = Math.max(0, marginA - marginB);

// =====================
// SYMBOLE – ATAK
// =====================
const attackEagles = result.rollA?.eagles ?? 0;
const attackShields = result.rollA?.shields ?? 0;

let damage = baseDamage
  + attackEagles
  - attackShields;

damage = Math.max(0, damage);

// =====================
// REDUKCJA OBRAŻEŃ
// =====================
const eq = defender.system.equipment;

// --- ARMOR ---
let armorProtection = 0;

if (eq.armor?.id) {
  const armorItem = defender.items.get(eq.armor.id);
  armorProtection = armorItem?.system?.protection ?? 0;
}

// --- SHIELD ---
let shieldProtection = 0;

const rightShield = eq.rightHand?.id
  ? defender.items.get(eq.rightHand.id)
  : null;

const leftShield = eq.leftHand?.id
  ? defender.items.get(eq.leftHand.id)
  : null;

const getShieldProtection = item =>
  item?.type === "shield"
    ? Number(item.system?.protection) || 0
    : 0;

shieldProtection = defenseType === "shield"
  ? Math.max(
      getShieldProtection(rightShield),
      getShieldProtection(leftShield)
    )
  : 0;

// =====================
// SYMBOLE – OBRONA
// =====================
const defenseEagles = result.rollB?.eagles ?? 0;
const defenseShields = result.rollB?.shields ?? 0;

let reduction =
  armorProtection +
  shieldProtection +
  defenseEagles -
  defenseShields;

reduction = Math.max(0, reduction);

// najpierw odejmujemy
damage = damage - reduction;

// dopiero potem clamp
damage = Math.max(0, damage);

const reductionText = `
  🛡 Redukcja: ${reduction}
  (${armorProtection} pancerz
   ${shieldProtection ? ` + ${shieldProtection} tarcza` : ""}
   ${defenseEagles ? ` + ${defenseEagles} 🦅` : ""}
   ${defenseShields ? ` - ${defenseShields} 🛡️` : ""}
  )
`;

let attackModText = "";

if (attackEagles !== 0 || attackShields !== 0) {
  attackModText = `
    ⚔ Modyfikator ataku:
    ${attackEagles ? `+${attackEagles} 🦅 ` : ""}
    ${attackShields ? `-${attackShields} 🛡️` : ""}
  `;
}

// =====================
// APPLY DAMAGE
// =====================
const defenderFate = defender.system.resources.fate.value ?? 0;
const needsDamageChoice = damage > 0 && defenderFate > 0;
const autoDamage = damage > 0 && defenderFate < 1;

if (autoDamage) {
  await defender.applyDamage(damage);
}

// =====================
// UPDATE WIADOMOŚCI PO ID
// =====================
if (result?.messageId) {

  const msg = game.messages.get(result.messageId);

  if (msg) {
const damageControls = damage > 0
  ? renderDamageControls({
      messageId: result.messageId,
      defenderUuid: defender.uuid,
      damage,
      hasFate: needsDamageChoice
    })
  : "";

const newContent = msg.content + `
  <div class="crp-damage">
    💥 Obrażenia bazowe: <b>${baseDamage}</b><br>
    ${reductionText}<br>
    ${attackModText ? attackModText + "<br>" : ""}
    👉 Obrażenia końcowe: <b>${damage}</b>
    ${damageControls}
  </div>
`;

    await msg.update({ content: newContent });

    if (autoDamage) {
      await msg.setFlag("crp", "damageResolved", {
        action: "auto",
        defenderUuid: defender.uuid,
        damage
      });
    }
  }
}

}

const defenseLabel = {
  parry: "Parowanie",
  dodge: "Unik",
  shield: "Tarcza"
}[defenseType] ?? defenseType;

// lokalna podmiana tylko u tego gracza
for (const b of container.querySelectorAll("button")) {
  b.disabled = true;
}
container.innerHTML = `
  <div class="crp-defense-result">
    🛡 Wybrałeś: <b>${defenseLabel}</b>
  </div>
`;

  });
}

});

// =====================
// SOCKET → GM UPDATE
// =====================
Hooks.once("ready", () => {

  game.socket.on("system.crp", async (data) => {

    if (!game.user.isGM) return;

    if (data.type === "damageChoiceSync") {
      const defender = await fromUuid(data.defenderUuid);
      const resolvedDamage = defender?.getFlag("crp", "resolvedDamage") ?? {};
      const resolved = resolvedDamage[data.messageId];

      if (resolved) {
        try {
          await updateDamageMessage({
            messageId: data.messageId,
            defenderUuid: data.defenderUuid,
            action: resolved.action,
            amount: resolved.damage,
            status: resolved.status
          });
        } catch (err) {
          console.warn("CRP | Nie udało się zsynchronizować wiadomości obrażeń", err);
        }
      }

      return;
    }

    if (data.type === "damageChoice") {
      const defender = await fromUuid(data.defenderUuid);
      const user = game.users.get(data.userId);

      const respond = (ok, message = "") => {
        game.socket.emit("system.crp", {
          type: "damageChoiceResult",
          requestId: data.requestId,
          userId: data.userId,
          ok,
          message
        });
      };

      if (!canUserResolveDamage(defender, user)) {
        respond(false, "Brak uprawnień do rozliczenia obrażeń tej postaci.");
        return;
      }

      try {
        const resolved = await resolvePendingDamage(data);
        respond(!!resolved, resolved ? "" : "Te obrażenia zostały już rozliczone albo wiadomość nie istnieje.");
      } catch (err) {
        console.error("CRP | Błąd rozliczania obrażeń przez socket", err);
        respond(false, "Błąd rozliczania obrażeń po stronie MG.");
      }

      return;
    }

    if (data.type !== "defenseSelected") return;

    const msg = game.messages.get(data.messageId);
    if (!msg) return;

    const defenseLabel = {
      parry: "Parowanie",
      dodge: "Unik",
      shield: "Tarcza"
    }[data.defenseType] ?? data.defenseType;

    await msg.update({
      content: `
        <div class="crp-defense-result">
          🛡 Wybrana obrona: <b>${defenseLabel}</b>
        </div>
      `
    });

  });

});
Hooks.once("diceSoNiceReady", async (dice3d) => {
  dice3d.addSystem({ id: "crp", name: "Corona Regni Poloniae" }, 'preferred');

  dice3d.addColorset({
    name: "crp",
    description: "Corona Regni Poloniae",
    category: "Colors",
    foreground: "#ffffff",
    background: "#000000",
    outline: "gray",
    texture: "none",
    
  },
  'preferred');

  dice3d.addDicePreset(
    {
      type: "d10",
      labels: [
        "systems/crp/assets/orzel-kostka.webp",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "systems/crp/assets/tarcza_kostka.webp"
      ],
      system: "crp",
      labelScale: 0.5,
    },
    "d10",
  );

})
