import { CRPRoll } from "../rolls/roll.mjs";
import { CRPAdvancementWindow } from "../app/advancment.mjs";
 // module/actor/actor.mjs

const ARMOR_PENALIZED_SKILLS = new Set(["athletics", "stealth", "survival"]);
const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);


function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}

export class CRPActor extends Actor {
  prepareDerivedData() {

    super.prepareDerivedData();

    const system = this.system;
    const attr = system.attributes;
    const derived = system.derived;
    const isNPC = isNPCActor(this);

    // Inicjatywa
    derived.initiative = isNPC
      ? Number(system.npc?.attributes) || 0
      : attr.agility.value + attr.perception.value;

    derived.initiativeWeaponModifier = this.getInitiativeWeaponModifier();
    derived.initiativeArmorModifier = this.getInitiativeArmorModifier();
    derived.initiativeTotal =
      derived.initiative +
      derived.initiativeWeaponModifier +
      derived.initiativeArmorModifier;

    // Zdrowie
    const maxHealth = isNPC
      ? Math.max(1, Number(derived.health.max) || 8)
      : attr.strength.value + attr.character.value;

    if (!isNPC) {
      derived.health.max = maxHealth;
    }

    if (isNPC && (!Number.isFinite(Number(derived.health.value)) || derived.health.value < 1)) {
      derived.health.value = maxHealth;
    }

    // clamp
    if (derived.health.value > maxHealth) {
      derived.health.value = maxHealth;
    }

    if (isNPC) {
      const equipment = system.equipment ?? {};
      const armorId = equipment.armor?.id;
      const armor = armorId ? this.items.get(armorId) : null;
      const shields = ["rightHand", "leftHand"]
        .map(slot => {
          const id = equipment[slot]?.id;
          return id ? this.items.get(id) : null;
        })
        .filter(item => item?.type === "shield");

      system.npc.protection = [
        armor?.type === "armor" ? armor : null,
        ...shields
      ].filter(Boolean).reduce((sum, item) => sum + (Number(item.system.protection) || 0), 0);
    }

    // PUNKTY MANEWRU
    const combatSkills = [
      attr.strength.skills.twoHanded.value,
      attr.strength.skills.brawl.value,
      attr.agility.skills.oneHanded.value,
      attr.agility.skills.lightWeapons.value,
      attr.strength.skills.shield.value,
      attr.perception.skills.ranged.value
    ];

    const bestCombatSkill = Math.max(...combatSkills);

    const maxManeuver =
      attr.perception.value +
      attr.reason.value;

    derived.maneuver.max = maxManeuver;

    if (derived.maneuver.value > maxManeuver || derived.maneuver.value === 0) {
      derived.maneuver.value = maxManeuver;
    }

    const hp = derived.health.value;
    const max = derived.health.max;

    let penalty = 0;

    // progi
    if (hp <= 0) {
      penalty = -2;
    } else if (hp < max / 2) {
      penalty = -1;
    }

    system.derived.woundPenalty = penalty;

    let woundState = "healthy";

    if (hp <= 0) {
      woundState = "critical";
    } else if (hp < max / 2) {
      woundState = "wounded";
    }

    system.derived.woundState = woundState;
  
  }

  async rollSkill(attrKey, skillKey) {


    
  return await CRPRoll.skill(this, attrKey, skillKey);

  
}

_mapSkillToAttribute(skillKey) {

  const map = {
    // STR
    twoHanded: "strength",
    brawl: "strength",
    endurance: "strength",
    shield: "strength",
    intimidate: "strength",

    // AGI
    oneHanded: "agility",
    lightWeapons: "agility",
    athletics: "agility",
    craft: "agility",
    stealth: "agility",

    // PER
    ranged: "perception"
  };

  return map[skillKey];
}

getWeaponInitiativeModifier(item) {
  if (!item || item.type !== "weapon") return 4;
  if (item.system.range === "ranged" || item.system.skill === "ranged") return -3;
  if (item.system.skill === "lightWeapons") return 2;
  if (item.system.skill === "twoHanded") return -2;
  return 0;
}

getInitiativeWeaponModifier() {
  const equipment = this.system.equipment ?? {};

  const modifiers = ["rightHand", "leftHand"].map(slot => {
    const id = equipment[slot]?.id;
    const item = id ? this.items.get(id) : null;

    return this.getWeaponInitiativeModifier(item);
  });

  return Math.min(...modifiers);
}

getInitiativeArmorModifier() {
  const item = this.getEquippedArmor();

  return item?.type === "armor"
    ? -(item.system.protection ?? 0)
    : 0;
}

getEquippedArmor() {
  const equipment = this.system.equipment ?? {};
  const id = equipment.armor?.id;

  return id ? this.items.get(id) : null;
}

getArmorSkillPenalty(skillKey) {
  if (!ARMOR_PENALIZED_SKILLS.has(skillKey)) return 0;

  const armor = this.getEquippedArmor();
  if (armor?.type !== "armor") return 0;

  return Math.max(0, Number(armor.system.protection) || 0);
}

getEquippedWeapon(skillKey = null) {
  const equipment = this.system.equipment ?? {};
  const handWeapons = ["rightHand", "leftHand"]
    .map(slot => {
      const id = equipment[slot]?.id;
      return id ? this.items.get(id) : null;
    })
    .filter(item => item?.type === "weapon");

  const equippedWeapons = this.items
    .filter(item => item.type === "weapon" && item.system.equipped);

  const candidates = [...handWeapons, ...equippedWeapons]
    .filter((item, index, array) => array.findIndex(i => i.id === item.id) === index)
    .filter(item => !skillKey || item.system.skill === skillKey);

  return candidates.sort((a, b) =>
    (b.system.damage ?? 0) - (a.system.damage ?? 0)
  )[0] ?? null;
}


async opposedTest(targetActor, attrA, skillA, attrB, skillB, options = {}) {
  return await CRPRoll.opposed(
    this, attrA, skillA,
    targetActor, attrB, skillB,
    options
  );
}

async spendFate(amount = 1) {

  const current = this.system.resources.fate.value;

  if (current < amount) {
    ui.notifications.warn("Brak punktów Doli!");
    return false;
  }

  await this.update({
    "system.resources.fate.value": current - amount
  });

  return true;
}

async applyWoundsState() {
  const hp = this.system.derived.health.value;

  const update = {};

  if (hp <= 0 && !this.system.state.bleeding) {
    update["system.state.bleeding"] = true;
  }

  if (hp > 0 && this.system.state.bleeding) {
    update["system.state.bleeding"] = false;
  }

  if (Object.keys(update).length) {
    await this.update(update);
  }
}

async clearWoundsState() {
  await this.update({
    "system.state.bleeding": false,
    "system.state.unconscious": false,
    "system.state.life": "alive"
  });
}

async applyDamage(amount) {

  if (amount <= 0) return;

  const hp = this.system.derived.health.value;
  const max = this.system.derived.health.max;

  const currentHp = Number(hp) || 0;
  const newHp = Math.max(-max, currentHp - amount);

  await this.update({
    "system.derived.health.value": newHp
  });

  await this.applyWoundsState();
}
//rzeczy do zrobienia przed stworzeniem Aktora
async _preCreate(data, options, user) {
  await super._preCreate(data, options, user);
  const actor = this;
  if (!["character", ...CRP_NPC_ACTOR_TYPES].includes(actor.type)) return;
    const reasonValue = this?.system?.attributes?.reason?.value ?? 4;
    // TOKEN DEFAULT
    await this.updateSource({
      prototypeToken: {
        name: actor.name,
        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        bar1: {
          ttribute: "derived.health"
        }
      },
      ["system.resources.advantageUses.value"]: reasonValue
    });
  }
//rzeczy do zrobienia przy updacie Aktora
 async _onUpdate(data, options, user) {
  const  changeName = data?.name ?? false
   const actor = this;
  if(changeName && this.type === "character"){
    const tokenName = data.name
    const dialog =  await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("CRP.ui.dialog.changeTokenName.title"),
      content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenName.content", { name: tokenName })}</p>`,
    });         
    if (dialog) {
     
      await actor.prototypeToken.update({ name: tokenName });
      const dependedTokens = actor.getDependentTokens();
      for (const token of dependedTokens) {                      
        await token.update({ name: tokenName });
      }
    }
  }
  const tokenImg = data?.prototypeToken?.texture?.src ?? false;
  if(tokenImg && this.type === "character"){
    const tokenName = data.name
    const dialog =  await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize("CRP.ui.dialog.changeTokenImage.title"),
      content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenImage.content", { name: tokenName })}</p>`,
    });
    if (dialog) {
      await actor.prototypeToken.update({ name: tokenName });
      const dependedTokens = actor.getDependentTokens();
      for (const token of dependedTokens) {                      
        await token.update({ ["texture.src"]: tokenImg });
      }
    }
  }

    const hasExperienceChange = [
    "system.resources.experience",
    "system.resources.experience.value",
    "system.resources.experience.free",
    "system.resources.experience.log"
  ].some(path => hasChangedPath(data, path));
  const hasManeuverChange = [
    "system.derived.maneuver",
    "system.derived.maneuver.value",
    "system.derived.maneuver.max"
  ].some(path => hasChangedPath(data, path));

  if (hasExperienceChange && hasManeuverChange){
  if (hasExperienceChange) {
    CRPAdvancementWindow.refreshForActor(actor);
  }
}
    const mountedChanged =
    hasChangedPath(data, "system.equipment.mounted");

  if (mountedChanged) refreshMountedActorUnderlays(actor);

 }
 
}

function hasChangedPath(changed, path) {
  return foundry.utils.hasProperty(changed, path) || Object.hasOwn(changed, path);
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
function removeMountedTokenUnderlay(token) {
  if (!token?._crpMountUnderlay) return;

  token._crpMountUnderlay.destroy({ children: true });
  token._crpMountUnderlay = null;
}
const CRP_MOUNT_UNDERLAY = "systems/crp/assets/wierzchowiec.webp";
