import { CRPRoll } from "../rolls/roll.mjs";
import { formatMoney, normalizeMoney, obolsToMoney } from "../currency.mjs";
import {CRPAdvancementWindow} from "../app/advancment.mjs"

const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);
const { api, sheets } = foundry.applications;


export class CRPActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2,) {

   constructor(...args) {
    super(...args);

    /** @type {CharacterActor} */
    this.actor;
  }
  static DEFAULT_OPTIONS = {
    classes: ["crp-sheet", "sheet", "actor"],
    window: {
      title: "CRP Actor",
      resizable: true
    },
    position: {
      width: 945,
      height: 860
    },
    actions:{
      clearMoney: CRPActorSheet.#clearMoney,
      deleteItem: CRPActorSheet.#deleteItem,
      addAdvantageUses: CRPActorSheet.#addAdvantageUses,
      useAdvantageUses: CRPActorSheet.#useAdvantageUses,
    },
    form: {
      submitOnChange: true,
    },
    dragDrop: [{ dropSelector: ".crp-sheet" }]

  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/character-sheet.hbs"
    },
    bio: {
      id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-bio.hbs",
    },
    equipment: {
       id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-equipment.hbs",
    },
    attributes: {
       id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-attributes.hbs",
    },
  };
  static TABS = {
    items: {
      tabs: [
        { id: "bio", group: "items", label: "" },
        { id: "equipment", group: "items", label: "" },
        { id: "attributes", group: "items", label: "" },
      ],
      initial: "attributes",
    },
  };
  




  //  JEDYNE źródło danych dla template
async _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    const system = this.document.system;
    const config = CONFIG.CRP;

    const tokenImg =
  this.document.prototypeToken?.texture?.src ||
  this.document.img;

    const attributesList = [];



    const hp = system.derived.health;

hp.percent = hp.max > 0
  ? Math.floor((hp.value / hp.max) * 100)
  : 0;




const equippedArmor = system.equipment.armor?.id
  ? this.document.items.get(system.equipment.armor.id)
  : null;
const equippedShields = ["rightHand", "leftHand"]
  .map(slot => {
    const id = system.equipment[slot]?.id;
    return id ? this.document.items.get(id) : null;
  })
  .filter(item => item?.type === "shield");
const protection = {
  armor: equippedArmor?.type === "armor"
    ? Number(equippedArmor.system.protection) || 0
    : 0,
  shield: equippedShields.reduce(
    (sum, item) => sum + (Number(item.system.protection) || 0),
    0
  )
};

return {
  ...context,
  system,
  config,
  attributesList,
  formattedMoney: formatMoney(
    obolsToMoney(system.money.total)
  ),
  initiative: {
    weaponModifierText: system.derived.initiativeWeaponModifier >= 0
      ? `+${system.derived.initiativeWeaponModifier}`
      : `${system.derived.initiativeWeaponModifier}`,
    armorModifierText: system.derived.initiativeArmorModifier >= 0
      ? `+${system.derived.initiativeArmorModifier}`
      : `${system.derived.initiativeArmorModifier}`
  },
  protection,
  npcSheetLocked: !!this.document.getFlag("crp", "npcSheetLocked"),
  tokenImg,
  characterSheetsLocked: game.settings.get("crp", "characterSheetsLocked"),

};

  }
 async _prepareContext(options){
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    Object.assign(context, {
      actor: this.actor,
      system: system,
      attributesList: this._prepareAttributesList(),
      healthPercent :this._prepareHealthPercent(),
      initiative: this._prepareInitiative(),
      characterSheetsLocked: game.settings.get("crp", "characterSheetsLocked"),
      formattedMoney: formatMoney(obolsToMoney(system.money.total)),
      items: this.actor.items,
      woundPenalty: this._preparewoundPenalty(),
      traits: this._prepareTraits(),
      languages: this._prepareLanguages()
    });
   
    return context;
 }
 _prepareAttributesList() {
   const attributesList = [];
    const config = CONFIG.CRP;
    for (const key of Object.keys(config.attributes)) {
      const attrData = this.actor.system.attributes?.[key];
      attributesList.push({
        key,
        label: String(config.attributes[key]), // 👈 ważne
        value: attrData?.value ?? 0,
        skills: Object.keys(attrData?.skills ?? {}).map(sk => {
          const skillValue = attrData.skills[sk].value ?? 0;
          const attrValue = attrData?.value ?? 0;
          const armorPenalty = this.actor.getArmorSkillPenalty?.(sk) ?? 0;
            return {
              key: sk,
              label: String(config.skills[sk]),
              value: skillValue,
              total: Math.max(
                0,
              isNPCActor(this.actor)
                ? (Number(this.actor.system.npc?.attributes) || 0) - armorPenalty
                : skillValue + attrValue - armorPenalty
              ),
            armorPenalty
          };
        })
      });
    }
    return attributesList;
 }
 _prepareHealthPercent() {
   const system = this.actor.system;
   const hp = system.derived.health;
   return hp.max > 0 ? Math.floor((hp.value / hp.max) * 100) : 0;
 }
 _prepareInitiative() {
    const system = this.actor.system;
    const  initiative ={
    weaponModifierText: system.initiativeWeaponModifier >= 0
      ? `+${system.initiativeWeaponModifier}`
      : `${system.initiativeWeaponModifier}`,
    armorModifierText: system.initiativeArmorModifier >= 0
      ? `+${system.initiativeArmorModifier}`
      : `${system.initiativeArmorModifier}`
    }
    return initiative;
 }
 _preparewoundPenalty(){
     const system = this.actor.system;
   const hp = system.derived.health;
   let penalty = 0
       if (hp.value <= 0) {
      penalty = -2;
    } else if (hp.value < hp.max / 2) {
      penalty = -1;
    }
    return penalty
 }
 _prepareTraits(){
  const flaws = this.document.items.filter(item =>
    item.type === "trait" && item.system.category === "flaw"
  );
  const advantages = this.document.items.filter(item =>
    item.type === "trait" && item.system.category === "advantage"
  );
 return {
    flaws: flaws,
    advantages: advantages,
    advantagesRemaining: Math.max(0, 2 - advantages.length),
    flawsRemaining: Math.max(0, 1 - flaws.length),
    advantageUses: this.actor.system.resources.advantageUses?.value ?? 0
 }
}
_prepareLanguages(){
  const nativeLanguage = this.actor.items.find(item =>
  item.type === "language" && item.system.role === "native"
) ?? null;
const foreignLanguages = this.actor.items.filter(item =>
  item.type === "language" && item.system.role === "foreign"
);
const foreignLanguageLimit = this._getForeignLanguageLimit();
  return {
    native: nativeLanguage,
    foreign: foreignLanguages,
    used: foreignLanguages.length,
    remaining: Math.max(0, foreignLanguageLimit - foreignLanguages.length),
    limit: foreignLanguageLimit,
    alphabets: {
      latin: "Łaciński",
      cyrillic: "Cyrylica",
      arabic: "Arabski",
      none: "Brak"
    }
  }
}
_onRender(context, options) {
  const scrollTop = this._pendingScrollTop ?? this._getScrollTop();
  super._onRender(context, options);

const html = this._getRootElement();

if (!html) {
  console.error("CRP: HTML root NOT FOUND");
  return;
}

this._restoreScrollPosition(scrollTop);
this._pendingScrollTop = undefined;

  // ======================
  //  ROLL
  // ======================
  html.querySelectorAll(".crp-skill").forEach(el => {
    el.addEventListener("click", async ev => {

      if (ev.target.closest("input")) return;

      const attr = el.dataset.attr;
      const skill = el.dataset.skill;
      const choice = await getSkillModifier().catch(() => null);

      if (!choice?.confirmed) return;

      const targetOverride = isNPCActor(this.document)
        ? this.document.system.npc?.attributes
        : null;

      CRPRoll.skill(this.document, attr, skill, {
        modifier: choice.modifier,
        displayModifier: choice.modifier,
        targetOverride
      });
    });
  });

html.querySelectorAll(".crp-roll-npc-attributes").forEach(btn => {
  btn.addEventListener("click", async ev => {
    ev.stopPropagation();

    const choice = await getSkillModifier().catch(() => null);

    if (!choice?.confirmed) return;

    CRPRoll.skill(this.document, "strength", "endurance", {
      modifier: choice.modifier,
      displayModifier: choice.modifier,
      targetOverride: this.document.system.npc?.attributes,
      rollLabel: "Rzut na Atrybut postaci"
    });
  });
});

  // ======================
//  ROLL WILLPOWER
// ======================
html.querySelectorAll(".crp-roll-willpower").forEach(btn => {
  btn.addEventListener("click", ev => {

    ev.stopPropagation();

    CRPRoll.willpower(this.document);

  });
});

// ======================
//  ROLL INITIATIVE
// ======================
html.querySelectorAll(".crp-roll-initiative").forEach(btn => {
  btn.addEventListener("click", ev => {

    ev.stopPropagation();

    if (
      btn.classList.contains("crp-roll-npc-attributes") ||
      btn.classList.contains("crp-npc-sheet-lock")
    ) return;

    CRPRoll.initiative(this.document);

  });
});

html.querySelector(".crp-npc-sheet-lock")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  const locked = !!this.document.getFlag("crp", "npcSheetLocked");
  await this.document.setFlag("crp", "npcSheetLocked", !locked);
  this.render(false);
});

  // ======================
  //  INPUTY
  // ======================



  // ======================
  //  NAZWA
  // ======================
  const nameEl = html.querySelector("[data-edit='name']");
  if (nameEl) {
    nameEl.addEventListener("blur", async ev => {
      await this.document.update({
        name: ev.currentTarget.innerText
      });
    });
  }

  // ======================
  //  PORTRET
  // ======================
  html.querySelectorAll("[data-edit='img']").forEach(img => {
    img.addEventListener("click", () => {
      new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: this.document.img,
        callback: async (path) => {

          const currentToken = this.document.prototypeToken?.texture?.src;
          const currentPortrait = this.document.img;

          const isDefaultToken =
            !currentToken || currentToken === currentPortrait;

          await this.document.update({
            img: path,
            ...(isDefaultToken && {
              "prototypeToken.texture.src": path
            })
          });

        }
      }).render(true);
    });
  });

  // ======================
  //  TOKEN
  // ======================
  html.querySelectorAll("[data-edit='token']").forEach(img => {
    img.addEventListener("click", () => {
      new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: this.document.prototypeToken?.texture?.src || this.document.img,
        callback: async (path) => {

          await this.document.update({
            "prototypeToken.texture.src": path
          });

        }
      }).render(true);
    });
  });

  // ======================
  //  EQUIP
  // ======================
  html.querySelectorAll(".crp-equip").forEach(el => {
    el.addEventListener("change", async ev => {

      const item = this.document.items.get(ev.target.dataset.itemId);
      if (!item) return;

      await item.update({
        "system.equipped": ev.target.checked
      });

    });
  });


  // ======================
  //  DRAG & DROP (FIX)
  // ======================
const root = this.element[0] ?? this.element;

// tylko DROP ma być jednokrotny
if (!root.dataset?.dropBound) {
  root.dataset.dropBound = "true";

  root.addEventListener("dragover", ev => ev.preventDefault());

  root.addEventListener("drop", async ev => {
    ev.preventDefault();

    if (this._dropping) return;
    this._dropping = true;

    try {
      const TextEditorImpl =
        foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;

      let data = TextEditorImpl.getDragEventData(ev);

      if (!data || !data.type) {
        try {
          data = JSON.parse(ev.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
      }

      if (data.type !== "Item") return;

      const item = await fromUuid(data.uuid);
      if (!item) return;

      const traitDrop = ev.target.closest?.(".crp-trait-drop");

      if (traitDrop) {
        await this._assignTrait(item, traitDrop.dataset.traitCategory);
        return;
      }

      const originDrop = ev.target.closest?.(".crp-origin-drop");

      if (originDrop) {
        await this._assignOrigin(item);
        return;
      }

      const languageDrop = ev.target.closest?.(".crp-language-drop");

      if (languageDrop) {
        await this._assignLanguage(item, languageDrop.dataset.languageRole);
        return;
      }

      if (item.type === "language") {
        ui.notifications.warn("Przeciągnij język do odpowiedniej sekcji w zakładce Biografia.");
        return;
      }

      if (item.type === "origin") {
        ui.notifications.warn("Przeciągnij Pochodzenie do odpowiedniego slotu w zakładce Biografia.");
        return;
      }

      if (item.type === "trait") {
        ui.notifications.warn("Przeciągnij Wadę lub Zaletę do odpowiedniej sekcji w zakładce Biografia.");
        return;
      }

      let slotEl = ev.target;

      while (slotEl && !slotEl.classList?.contains("crp-eq-slot")) {
        slotEl = slotEl.parentElement;
      }

if (slotEl) {
  const slot = slotEl.dataset.slot;

  if (item.parent?.id !== this.document.id) {
    ui.notifications.warn("Możesz używać tylko przedmiotów z ekwipunku!");
    return;
  }

  // 🔥 WALIDACJA SLOTU
  const isHand = slot === "rightHand" || slot === "leftHand";

  const valid =
    (slot === "armor" && item.type === "armor") ||
    (isHand && (item.type === "weapon" || item.type === "shield"));

  if (!valid) {
    ui.notifications.warn("Nie można umieścić tego przedmiotu w tym slocie");
    return;
  }

  const eq = this.document.system.equipment;

  const updates = {};
  const isTwoHandedWeapon = (item) =>
    item?.type === "weapon" && ["twoHanded", "ranged"].includes(item.system.skill);

  // Broń dwuręczna i strzelecka zawsze zajmuje obie ręce.
  if (isHand && isTwoHandedWeapon(item)) {
    const slotData = {
      id: item.id,
      name: item.name,
      img: item.img
    };

    updates["system.equipment.rightHand"] = slotData;
    updates["system.equipment.leftHand"] = slotData;

    this._rememberScrollPosition();
    await this.document.update(updates);

    return;
  }

  // 🔥 USUŃ Z DRUGIEGO SLOTU RĘKI
  if (isHand) {
    const otherSlot = slot === "rightHand" ? "leftHand" : "rightHand";
    const otherItemId = eq[otherSlot]?.id;
    const otherItem = otherItemId ? this.document.items.get(otherItemId) : null;

    if (otherItemId === item.id || isTwoHandedWeapon(otherItem)) {
      updates[`system.equipment.${otherSlot}`] = {
        id: null,
        name: null,
        img: null
      };
    }
  }

  // 🔥 USTAW W NOWYM SLOCIE
  updates[`system.equipment.${slot}`] = {
    id: item.id,
    name: item.name,
    img: item.img
  };

  this._rememberScrollPosition();
  await this.document.update(updates);
  this.render({force: true});
  return;
}

      if (item.parent?.id === this.document.id) return;

      const sourceActor = item.parent?.documentName === "Actor" ? item.parent : null;

      if (sourceActor && sourceActor.id !== this.document.id && !sourceActor.isOwner && !game.user.isGM) {
        ui.notifications.warn("Brak uprawnień do przeniesienia przedmiotu z aktora źródłowego.");
        return;
      }

      this._rememberScrollPosition();
      const itemData = item.toObject();
      delete itemData._id;

      const [created] = await this.document.createEmbeddedDocuments("Item", [itemData]);

      if (created.type === "weapon") {
        this._rememberScrollPosition();
        await created.update({ "system.equipped": true });
      }

      if (sourceActor && sourceActor.id !== this.document.id) {
        const sourceUpdates = {};
        const emptySlot = {
          id: null,
          name: null,
          img: null
        };

        for (const slot of ["rightHand", "leftHand", "armor"]) {
          if (sourceActor.system.equipment?.[slot]?.id === item.id) {
            sourceUpdates[`system.equipment.${slot}`] = emptySlot;
          }
        }

        if (Object.keys(sourceUpdates).length) {
          await sourceActor.update(sourceUpdates);
        }

        await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
        sourceActor.sheet?.render(false);
      }

    } finally {
      this._dropping = false;
    }
  });
}



html.querySelectorAll(".crp-item-row").forEach(el => {

  // ======================
  // DRAG
  // ======================
  el.addEventListener("dragstart", ev => {

    const itemId = el.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    ev.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      uuid: item.uuid
    }));

  });

  // ======================
  // CLICK → OTWÓRZ ITEM
  // ======================
  el.addEventListener("click", ev => {

    // ❗ NIE otwieraj przy kliknięciu delete
    if (ev.target.closest(".crp-item-delete")) return;

    const itemId = el.dataset.itemId;
    if (!itemId) return;

    const item = this.document.items.get(itemId);
    if (!item) return;

    item.sheet.render(true);
  });

});

html.querySelectorAll(".crp-eq-slot").forEach(el => {
  el.addEventListener("click", async ev => {

    // ❗ ignoruj klik w delete
    if (ev.target.closest(".crp-slot-clear")) return;

    // ❗ znajdź slot po DOM (nie po el)
    let slotEl = ev.target;
    while (slotEl && !slotEl.classList?.contains("crp-eq-slot")) {
      slotEl = slotEl.parentElement;
    }

    if (!slotEl) return;

    const slot = slotEl.dataset.slot;

    // tylko ręce
    if (slot !== "rightHand" && slot !== "leftHand") return;

    const eq = this.document.system.equipment[slot];
const itemId = typeof eq === "string" ? eq : eq?.id;
    const item = itemId ? this.document.items.get(itemId) : null;

    if (item && item.type !== "weapon") {
      ui.notifications.warn("Tarcza nie sluzy do ataku.");
      return;
    }

    const isUnarmedAttack = !item;
    const attackSkill = isUnarmedAttack ? "brawl" : item.system?.skill;
    const itemType = isUnarmedAttack ? "unarmed" : item.type;
    const itemRange = isUnarmedAttack ? "melee" : item.system?.range;
    const attackerMounted = !!this.document.system.equipment.mounted;
    const getSlotAttackModifier = () => {
      if (isUnarmedAttack) return -3;
      if (item.type !== "weapon") return 0;
      if (itemRange === "ranged" || attackSkill === "ranged") return 2;
      if (attackSkill === "lightWeapons") return -1;
      if (attackSkill === "twoHanded") return 3;
      return 1;
    };
    const attackModifier = getSlotAttackModifier();

    // target
    const targets = Array.from(game.user.targets);
    if (!targets.length) {
      ui.notifications.warn("Brak celu");
      return;
    }

    const targetActor = targets[0].actor;
    if (!targetActor) return;

const equipment = targetActor.system.equipment;
const defenderMounted = !!equipment.mounted;

const isValidParryWeapon = (item) => {
  if (!item) return false;

  if (item.type !== "weapon") return false;

  // KLUCZOWE
  if (item.system.range === "ranged") return false;

  return true;
};

const rightItem = equipment.rightHand?.id
  ? targetActor.items.get(equipment.rightHand.id)
  : null;

const leftItem = equipment.leftHand?.id
  ? targetActor.items.get(equipment.leftHand.id)
  : null;

const isRangedAttack = itemRange === "ranged";

const hasParryWeapon =
  isValidParryWeapon(rightItem) ||
  isValidParryWeapon(leftItem);

const hasEmptyHand =
  !equipment.rightHand?.id ||
  !equipment.leftHand?.id;

const canParry = hasParryWeapon || (isUnarmedAttack && hasEmptyHand);

  const isShield = (item) => item?.type === "shield";

const hasShield =
  isShield(rightItem) ||
  isShield(leftItem);

const mountedAdvantage = attackerMounted && !defenderMounted ? 2 : 0;
const attackChoice = await getAttackModifier(this.document, {
  allowManeuvers: !isNPCActor(this.document)
}).catch(() => null);

if (!attackChoice?.confirmed) return;

const selectedAttackModifier = attackChoice.modifier;
const maneuverCost = Math.max(0, Number(attackChoice.maneuverCost) || 0);
const currentManeuver = this.document.system.derived.maneuver?.value ?? 0;

if (maneuverCost > currentManeuver) {
  ui.notifications.warn("Brak wystarczającej liczby Punktów Manewru.");
  return;
}

if (maneuverCost > 0) {
  await this.document.update({
    "system.derived.maneuver.value": currentManeuver - maneuverCost
  });
}

const combat = game.combat;
const combatant = combat?.combatants.find(combatant => combatant.actor?.id === this.document.id);
const aimedAttack = this.document.getFlag("crp", "aimedAttack");
const aimedAttackBonus =
  combat?.started &&
  aimedAttack?.combatId === combat.id &&
  aimedAttack?.combatantId === combatant?.id
    ? Number(aimedAttack.bonus) || 3
    : 0;
const startsAimedAttack =
  attackChoice.maneuver === "aimedAttack" &&
  combat?.started &&
  combatant;
const oneTimeAimedAttack =
  attackChoice.maneuver === "aimedAttack" &&
  !combat?.started;
const startsDefensiveAttack =
  attackChoice.maneuver === "defensiveAttack" &&
  combat?.started &&
  combatant;
const oneTimeDefensiveAttack =
  attackChoice.maneuver === "defensiveAttack" &&
  !combat?.started;

if (startsAimedAttack) {
  await this.document.setFlag("crp", "aimedAttack", {
    combatId: combat.id,
    combatantId: combatant.id,
    expiresRound: (combat.round ?? 0) + 1,
    bonus: 3
  });
}

if (startsDefensiveAttack) {
  await this.document.setFlag("crp", "defensiveAttack", {
    combatId: combat.id,
    combatantId: combatant.id,
    expiresRound: (combat.round ?? 0) + 1,
    bonus: 3
  });
}

if (oneTimeDefensiveAttack) {
  await this.document.setFlag("crp", "defensiveAttack", {
    oneTime: true,
    bonus: 3
  });
}

const totalAttackModifier =
  attackModifier +
  mountedAdvantage +
  selectedAttackModifier +
  (startsAimedAttack || oneTimeAimedAttack ? 3 : aimedAttackBonus);

const msg = await ChatMessage.create({
content: `
  <div class="crp-defense-choice"
    data-message-id=""
    data-attacker="${this.document.uuid}"
    data-defender="${targetActor.uuid}"
    data-skill="${attackSkill}"
data-item-type="${itemType}"
data-range="${itemRange}"
data-attack-modifier="${totalAttackModifier}"
data-selected-attack-modifier="${selectedAttackModifier}"
data-attacker-mounted="${attackerMounted ? "true" : "false"}"
data-defender-mounted="${defenderMounted ? "true" : "false"}">

    <p>Wybierz obronę:</p>

<button 
  data-defense="parry"
  ${!canParry ? "disabled" : ""}
  data-blocked-by-range="${isRangedAttack ? "true" : "false"}">
  Parowanie
</button>

<button data-defense="dodge">Unik${defenderMounted ? " (-2)" : ""}</button>

<button data-defense="shield" ${!hasShield ? "disabled" : ""}>
  Tarcza
</button>
  </div>
`
});

await msg.update({
  content: msg.content.replace(
    'data-message-id=""',
    `data-message-id="${msg.id}"`
  )
});

  });
});

html.querySelectorAll(".crp-slot-clear").forEach(btn => {
  btn.addEventListener("click", async ev => {

    ev.stopPropagation();

    const slot = ev.currentTarget.dataset.slot;
    const eq = this.document.system.equipment;
    const itemId = eq[slot]?.id;
    const item = itemId ? this.document.items.get(itemId) : null;
    const updates = {};

    const clearSlot = (slot) => {
      updates[`system.equipment.${slot}`] = {
        id: null,
        name: null,
        img: null
      };
    };

    if (item?.type === "weapon" && ["twoHanded", "ranged"].includes(item.system.skill)) {
      clearSlot("rightHand");
      clearSlot("leftHand");
    } else {
      clearSlot(slot);
    }

this._rememberScrollPosition();
await this.document.update(updates);
this.render({force: true});

  });
});

// ======================
// ADVANCEMENT
// ======================
html.querySelector(".crp-exp")?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();

  new CRPAdvancementWindow(this.document).render({ force: true });
});





// ======================
// BIO EDITOR
// ======================
html.querySelector(".crp-bio-edit")?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();

  this._openBioEditor();
});

html.querySelector(".crp-origin-drop")?.addEventListener("click", ev => {
  if (ev.target.closest(".crp-origin-clear")) return;

  const originId = this.document.system.bio?.origin?.id;
  this.document.items.get(originId)?.sheet?.render(true);
});

html.querySelector(".crp-origin-clear")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  if (game.settings.get("crp", "characterSheetsLocked")) {
    ui.notifications.warn("Karta postaci jest zablokowana.");
    return;
  }

  const originId = this.document.system.bio?.origin?.id;

  this._rememberScrollPosition();
  await this.document.update({
    "system.bio.origin": {
      id: null,
      name: null,
      img: null
    }
  });

  if (originId && this.document.items.get(originId)?.type === "origin") {
    this._rememberScrollPosition();
    await this.document.deleteEmbeddedDocuments("Item", [originId]);
  }
});

html.querySelector(".crp-crest-select")?.addEventListener("click", () => {
  new foundry.applications.apps.FilePicker.implementation({
    type: "image",
    current: this.document.system.bio?.crest || "",
    callback: async path => {
      this._rememberScrollPosition();
      await this.document.update({ "system.bio.crest": path });
    }
  }).render(true);
});

html.querySelector(".crp-crest-clear")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  this._rememberScrollPosition();
  await this.document.update({ "system.bio.crest": "" });
});

}
_processFormData(event, form, formData) {
  return super._processFormData(event, form, formData);
}
async _onDrop(event) {
  super._onDrop(event);
  const data = event.dataTransfer;
  const toElement = event.toElement;
  const parent = toElement.closest(".crp-eq-slot")
  if(toElement.classList.value.includes("slot") || parent?.classList?.value.includes("slot")){
      let updateData = {};
    const droppedItem = JSON.parse(data.getData("text/plain"))
    const itemDoc = await fromUuid(droppedItem.uuid);
    const slotType = toElement?.dataset?.slot || parent?.dataset?.slot;
    if(itemDoc.type == slotType || (slotType.includes("Hand")&&itemDoc.type === "weapon")){
      switch (slotType){
        case "armor":
          updateData = {["system.equipment.armor"]: {
              id: itemDoc.id,
              name: itemDoc.name,
              img: itemDoc.img
            }}
          break;
        case "leftHand":
          updateData= {["system.equipment.leftHand"]: {
              id: itemDoc.id,
              name: itemDoc.name,
              img: itemDoc.img
            }}
          break;
        case "rightHand":
          updateData= {["system.equipment.rightHand"]: {
              id: itemDoc.id,
              name: itemDoc.name,
              img: itemDoc.img
            }}
          break;
      }
      await this.actor.update(updateData);
      this.render({force:true})
    }
  }
}
  static async #clearMoney(ev){
      const confirmed = await foundry.applications.api.DialogV2.confirm({

    window: {
      title: "Opróżnić sakiewkę?"
    },

    content: `
      <p>
        Czy na pewno chcesz usunąć wszystkie monety tej postaci?
      </p>
    `,

    yes: {
      label: "Opróżnij",
      icon: "fa-solid fa-coins"
    },

    no: {
      label: "Anuluj",
      icon: "fa-solid fa-times"
    }

  });

  if (!confirmed) return;

  const emptyMoney = normalizeMoney({
    grzywna: 0,
    skojec: 0,
    grosz: 0,
    kwartnik: 0,
    cwiercgrosz: 0,
    denar: 0,
    obol: 0
  });

  this._rememberScrollPosition();

  await this.actor.update({
    "system.money": emptyMoney
  });
  this.render({force:true})
  }
  static async #deleteItem(ev){
 const btn = ev.target.closest(".crp-item-delete");
  if (!btn) return;
  if (
    btn.closest(".crp-bio") &&
    game.settings.get("crp", "characterSheetsLocked")
  ) {
    ui.notifications.warn("Karta postaci jest zablokowana.");
    return;
  }

  const itemId = btn.dataset.itemId;

  if (!itemId) return;

  const item = this.actor.items.get(itemId);

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "Usunąć przedmiot?"
    },
    content: `
      <p>
        Czy na pewno chcesz usunąć przedmiot
        <strong>${foundry.utils.escapeHTML(item?.name ?? "bez nazwy")}</strong>?
      </p>
    `,
    yes: {
      label: "Usuń",
      icon: "fa-solid fa-trash"
    },
    no: {
      label: "Anuluj",
      icon: "fa-solid fa-times"
    }
  });

  if (!confirmed) return;

  const eq = this.actor.system.equipment;
  const updates = {};
  const slots = ["rightHand", "leftHand", "armor"];

  for (const slot of slots) {
    if (eq[slot]?.id === itemId) {
      updates[`system.equipment.${slot}`] = {
        id: null,
        name: null,
        img: null
      };
    }
  }

  if (this.actor.system.bio?.origin?.id === itemId) {
    updates["system.bio.origin"] = {
      id: null,
      name: null,
      img: null
    };
  }

  this._rememberScrollPosition();
  await this.actor.deleteEmbeddedDocuments("Item", [itemId]);

  if (Object.keys(updates).length) {
    this._rememberScrollPosition();
    await this.actor.update(updates);
  }
  this.render({force:true})
  }
  static async #addAdvantageUses(){
    const current = this.actor.system.resources.advantageUses?.value ?? 0;
    await this.actor.update({
      "system.resources.advantageUses.value": current + 1
    });
    this.render({force:true})
}
static async #useAdvantageUses(){
  const current = this.actor.system.resources.advantageUses?.value ?? 0;
  if (current <= 0) {
    ui.notifications.warn("Brak dostępnych użyć Zalet.");
    return;
  }
  await this.actor.update({
    "system.resources.advantageUses.value": Math.max(0, current - 1)
  });
  this.render({force:true})
}
    _getRootElement() {
    return this.element instanceof HTMLElement
      ? this.element
      : this.element?.[0];
  }

  _getScrollContainers(root = this._getRootElement()) {
    const containers = [
      root?.closest?.(".window-content"),
      root?.querySelector(".window-content"),
      root?.querySelector(".crp-sheet"),
      root
    ].filter(el => el && typeof el.scrollTop === "number");

    return [...new Set(containers)];
  }

  _getScrollTop() {
    const containers = this._getScrollContainers();
    const scrolled = containers.find(el => el.scrollTop > 0);

    return scrolled?.scrollTop ?? containers[0]?.scrollTop ?? 0;
  }

  _rememberScrollPosition() {
    this._pendingScrollTop = this._getScrollTop();
  }

  _restoreScrollPosition(scrollTop = this._pendingScrollTop) {
    if (scrollTop === undefined) return;

    const restore = () => {
      for (const container of this._getScrollContainers()) {
        container.scrollTop = scrollTop;
      }
    };

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 0);
  }

  async _openBioEditor() {
    const current = this.document.system.bio?.description ?? "";
    const value = foundry.utils.escapeHTML(current);

    const content = `
      <div class="crp-bio-dialog">
        <prose-mirror
          name="bio"
          value="${value}">
        </prose-mirror>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: `Biografia: ${this.document.name}`,
        icon: "fa-solid fa-feather"
      },
      position: {
        width: 760
      },
      content,
      buttons: [
        {
          action: "save",
          label: "Zapisz",
          icon: "fa-solid fa-save",
          default: true,
          callback: (_event, _button, dialog) =>
            dialog.element.querySelector("prose-mirror[name='bio']")?.value ?? ""
        },
        {
          action: "cancel",
          label: "Anuluj",
          icon: "fa-solid fa-times",
          callback: () => null
        }
      ],
      render: (_event, dialog) => {
        dialog.element.querySelector("prose-mirror[name='bio']")?.focus();
      }
    });

    if (result === null) return;

    await this.document.update({
      "system.bio.description": result
    });

    this.render(false);
  }

  _getForeignLanguageLimit() {
    const value = Number(
      this.actor.system.attributes?.reason?.skills?.languages?.value ?? 0
    );
    if (value >= 10) return 4;
    if (value >= 9) return 3;
    if (value >= 6) return 2;
    if (value >= 3) return 1;
    return 0;
  }
}
function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}



async function getAttackModifier(actor, { allowManeuvers = true } = {}) {
  const strikeText = text => [...text].map(character => `${character}\u0336`).join("");
  const activeAimedAttack = actor.getFlag("crp", "aimedAttack");
  const activeDefensiveAttack = actor.getFlag("crp", "defensiveAttack");
  const hasActiveManeuver = !!activeAimedAttack || !!activeDefensiveAttack;
  const availableManeuver = actor.system.derived.maneuver?.value ?? 0;
  const maneuvers = [
    { key: "none", cost: 0, implemented: true },
    { key: "assault", cost: 0, implemented: false },
    { key: "holdBack", cost: 0, implemented: false },
    { key: "charge", cost: 0, implemented: false },
    { key: "shieldGuard", cost: 0, implemented: false },
    { key: "harry", cost: 1, implemented: false },
    { key: "withdraw", cost: 1, implemented: false },
    { key: "knockdown", cost: 1, implemented: false },
    { key: "standUp", cost: 1, implemented: false },
    { key: "defensiveAttack", cost: 2, implemented: true },
    { key: "aimedAttack", cost: 2, implemented: true },
    { key: "lightningAttack", cost: 2, implemented: false },
    { key: "shieldBash", cost: 2, implemented: false },
    { key: "extraDodge", cost: 4, implemented: false },
    { key: "disarm", cost: 4, implemented: false }
  ].map(maneuver => ({
    ...maneuver,
    name: game.i18n.localize(`CRP.Maneuvers.${maneuver.key}.name`),
    description: game.i18n.localize(`CRP.Maneuvers.${maneuver.key}.description`)
  })).sort((a, b) => {
    if (a.key === "none") return -1;
    if (b.key === "none") return 1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name, game.i18n.lang);
  }).map(maneuver => ({
    ...maneuver,
    displayName: maneuver.implemented ? maneuver.name : strikeText(maneuver.name),
    disabled:
      maneuver.key !== "none" &&
      (hasActiveManeuver || maneuver.cost > availableManeuver)
  }));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/attack.hbs",
    {
      maneuver: actor.system.derived.maneuver,
      maneuvers,
      allowManeuvers
    }
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Atak" },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Atakuj",
        default: true,
        callback: (_event, _button, dialog) => {
          const value = Number(dialog.element.querySelector("input[name='attackModifier']")?.value ?? 0);
          const maneuverSelect = dialog.element.querySelector("select[name='maneuver']");
          const maneuverOption = maneuverSelect?.selectedOptions[0];
          const maneuverCost = Number(maneuverOption?.dataset.cost ?? 0);
          const maneuverDisabled = maneuverOption?.disabled;

          return {
            confirmed: true,
            modifier: Math.max(-4, Math.min(4, Number.isFinite(value) ? value : 0)),
            maneuver: allowManeuvers && !maneuverDisabled ? maneuverSelect?.value ?? "none" : "none",
            maneuverCost: allowManeuvers && !maneuverDisabled && Number.isFinite(maneuverCost) ? maneuverCost : 0
          };
        }
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false })
      }
    ],
    render: (_event, dialog) => {
      const input = dialog.element.querySelector("input[name='attackModifier']");
      const output = dialog.element.querySelector(".crp-attack-modifier-value");
      if (!input || !output) return;

      const refreshOutput = () => {
        const value = Number(input.value) || 0;
        output.value = value >= 0 ? `+${value}` : String(value);
      };

      input.addEventListener("input", refreshOutput);
      refreshOutput();

      const maneuverSelect = dialog.element.querySelector("select[name='maneuver']");
      const maneuverDescription = dialog.element.querySelector(".crp-attack-maneuver-description");

      if (maneuverSelect && maneuverDescription) {
        const refreshManeuverDescription = () => {
          const option = maneuverSelect.selectedOptions[0];
          maneuverDescription.textContent = option?.dataset.description ?? "";
        };

        maneuverSelect.addEventListener("change", refreshManeuverDescription);
        refreshManeuverDescription();
      }
    }
  });
}

async function getSkillModifier() {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/skills.hbs"
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Test umiejętności" },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Rzuć",
        default: true,
        callback: (_event, _button, dialog) => {
          const value = Number(dialog.element.querySelector("input[name='skillModifier']")?.value ?? 0);
          return {
            confirmed: true,
            modifier: Math.max(-4, Math.min(4, Number.isFinite(value) ? value : 0))
          };
        }
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false })
      }
    ],
    render: (_event, dialog) => {
      const input = dialog.element.querySelector("input[name='skillModifier']");
      const output = dialog.element.querySelector(".crp-skills-modifier-value");
      if (!input || !output) return;

      const refreshOutput = () => {
        const value = Number(input.value) || 0;
        output.value = value >= 0 ? `+${value}` : String(value);
      };

      input.addEventListener("input", refreshOutput);
      refreshOutput();
    }
  });
}