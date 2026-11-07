import { CRPRoll } from "../rolls/roll.mjs";
import { CRPAdvancementWindow } from "../app/advancment.mjs";
// module/actor/actor.mjs

const ARMOR_PENALIZED_SKILLS = new Set(["athletics", "stealth", "survival"]);
const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);

function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}

export class CRPActor extends Actor {
  // prepareDerivedData() {
  //   super.prepareDerivedData();

  //   const system = this.system;
  //   const attr = system.attributes;
  //   const derived = system.derived;
  //   const isNPC = isNPCActor(this);

  //   // Inicjatywa
  //   derived.initiative = isNPC
  //     ? Number(system.npc?.attributes) || 0
  //     : attr.agility.value + attr.perception.value;

  //   derived.initiativeWeaponModifier = this.getInitiativeWeaponModifier();
  //   derived.initiativeArmorModifier = this.getInitiativeArmorModifier();
  //   derived.initiativeTotal =
  //     derived.initiative +
  //     derived.initiativeWeaponModifier +
  //     derived.initiativeArmorModifier;

  //   // Zdrowie
  //   const maxHealth = isNPC
  //     ? Math.max(1, Number(derived.health.max) || 8)
  //     : attr.strength.value + attr.character.value;

  //   if (!isNPC) {
  //     derived.health.max = maxHealth;
  //   }

  //   if (
  //     isNPC &&
  //     (!Number.isFinite(Number(derived.health.value)) ||
  //       derived.health.value < 0)
  //   ) {
  //     derived.health.value = 0;
  //   }

  //   // clamp
  //   if (derived.health.value > maxHealth) {
  //     derived.health.value = maxHealth;
  //   }

  //   if (isNPC) {
  //     const equipment = system.equipment ?? {};
  //     const armorId = equipment.armor?.id;
  //     const armor = armorId ? this.items.get(armorId) : null;
  //     const shields = ["rightHand", "leftHand"]
  //       .map((slot) => {
  //         const id = equipment[slot]?.id;
  //         return id ? this.items.get(id) : null;
  //       })
  //       .filter((item) => item?.type === "shield");

  //     system.npc.protection = [
  //       armor?.type === "armor" ? armor : null,
  //       ...shields,
  //     ]
  //       .filter(Boolean)
  //       .reduce((sum, item) => sum + (Number(item.system.protection) || 0), 0);
  //   }

  //   // PUNKTY MANEWRU
  //   const combatSkills = [
  //     attr.strength.skills.twoHanded.value,
  //     attr.strength.skills.brawl.value,
  //     attr.agility.skills.oneHanded.value,
  //     attr.agility.skills.lightWeapons.value,
  //     attr.strength.skills.shield.value,
  //     attr.perception.skills.ranged.value,
  //   ];

  //   const bestCombatSkill = Math.max(...combatSkills);

  //   const maxManeuver = attr.perception.value + attr.reason.value;

  //   derived.maneuver.max = maxManeuver;

  //   if (derived.maneuver.value > maxManeuver || derived.maneuver.value === 0) {
  //     derived.maneuver.value = maxManeuver;
  //   }

  //   const hp = derived.health.value;
  //   const max = derived.health.max;

  //   let penalty = 0;

  //   // progi
  //   if (hp <= 0) {
  //     penalty = -2;
  //   } else if (hp < max / 2) {
  //     penalty = -1;
  //   }

  //   system.derived.woundPenalty = penalty;

  //   let woundState = "healthy";

  //   if (hp <= 0) {
  //     woundState = "critical";
  //   } else if (hp < max / 2) {
  //     woundState = "wounded";
  //   }

  //   system.derived.woundState = woundState;
  // }

  async rollSkill({attrKey, skillKey, reRoll, allowFate, agonia, chat=true, useManeuver=false}) {
    const actor = this;
    const modyfiers = await this.getModifiers(skillKey, attrKey)
    const useFate = this.system.resources.fate.value > 0 && allowFate;
    if(!modyfiers){
      return
    }else{
      const rollLabel = await this._prepareRollLabel(attrKey, skillKey,reRoll);
      return await CRPRoll.skill({
        actor: actor, 
        modyfiers: modyfiers,
        allowFate: useFate,
        rollLabel: rollLabel,
        reRoll : reRoll,
        chat: chat,
        agonia:agonia,
        useManeuver: useManeuver,
      }
      );
    }
  }
  async opositeTest({attacker={},atackerRoll= {},defender={}, atackRoll = false,messageId = "", attack = false}){
    if(Object.keys(atackerRoll).length === 0){
    const attrKey = attacker.attackerAttrKey;
    const skillKey = attacker.attackerSkillKey;
    const modyfiers = await this.getModifiers(skillKey, attrKey)
    const useFate = this.system.resources.fate.value > 0 && attacker.allowFate;
        if(!modyfiers){
      return
    }else{
    const reRoll = attacker.reRoll;
    const rollLabel = await this._prepareRollLabel(attrKey, skillKey,reRoll);
    const attackerRollData = {
      actor: this, 
      modyfiers: modyfiers,
      reRoll : reRoll,
      allowFate: useFate,
      rollLabel: rollLabel,      
      chat: attacker.chat,
      agonia: attacker.agonia,
      useManeuver: attacker.useManeuver,
    }
    await CRPRoll.opositeTest({
      attacker: attackerRollData,
      defender: defender
    })
   }
  }else{
    const skillKey = defender.defenderSkill;
    const attrKey = this.getAttributeKey(skillKey)
    const modyfiers = await this.getModifiers(skillKey, attrKey)
    if(attack){
      const defenseModifier = this?.flags?.crp.maneuver?.defenseModifier ?? 0;
      if(defenseModifier !== 0){
        Object.assign(modyfiers,{defenseModifier: defenseModifier})
        modyfiers.totalMod = modyfiers.totalMod + defenseModifier
        modyfiers.target = modyfiers.target + defenseModifier;
      }
      const oponentModifier = this?.flags?.crp.maneuver?.oponentModifier ?? 0;
      if(oponentModifier !== 0){
        Object.assign(modyfiers,{oponentModifier: oponentModifier})
        modyfiers.totalMod = modyfiers.totalMod + oponentModifier
        modyfiers.target = modyfiers.target + oponentModifier;
      }
    }
    const useFate = this.system.resources.fate.value > 0 && attacker.allowFate;
        if(!modyfiers){
      return
    }else{
    const reRoll = defender.reRoll;
    const rollLabel = await this._prepareRollLabel(attrKey, skillKey,reRoll);
    const defenderRollData = {
      actor: this, 
      modyfiers: modyfiers,
      reRoll : reRoll,
      allowFate: useFate,
      rollLabel: rollLabel,      
      chat: defender.chat,
      agonia: defender.agonia,
      useManeuver: defender.useManeuver,
    }
    await CRPRoll.opositeTest({
      attacker: attacker,
      defender: defenderRollData,
      atackerRoll: atackerRoll,
      atackRoll: atackRoll,
      messageId: messageId

    })
    }
  
  
  }
  }
  async atackTest({skillKey, usedWeapon, target}){
    const actor = this;
    const attrKey = this.getAttributeKey(skillKey)
    const modyfiers = await this.getModifiers(skillKey, attrKey)
    const useFate = this.system.resources.fate.value > 0 && (this.type === "character" && this.type === "npc-rycerz")
    const maneoverMod = this.flags?.crp?.maneuver.offenceModifier;
    let weaopnMod = -3;
    
    const defenderActor = await game.actors.get(target);
    const defenderMounted = defenderActor?.system?.equipment?.mounted ?? false;
    const attackerMounted = this.system.equipment.mounted && this.system.attributes.character.animals.value > 0;
    const mountAttackMod = attackerMounted && !defenderMounted ? 2 : 0;  
    let weaponName = usedWeapon;
    if (typeof usedWeapon !== "string"){
      weaponName = usedWeapon.name
      switch(skillKey){
        case "twoHanded" :{
          weaopnMod = 3
          break
        }
        case "lightWeapons":{
          weaopnMod = -1
          break
        }
        case "oneHanded":{
          weaopnMod = 1
          break
        }
        case "ranged":{
          weaopnMod = 2
          break
        }
      }
    }
      if(!modyfiers){
        return
      }
      Object.assign(modyfiers,{
        weaopnMod: weaopnMod,
        maneoverMod: maneoverMod,
        mountedMod: mountAttackMod
      })
      modyfiers.target = modyfiers.target + weaopnMod + maneoverMod + mountAttackMod;
      modyfiers.totalMod = modyfiers.totalMod + weaopnMod + maneoverMod + mountAttackMod;
      const rollLabel = await this._prepareRollLabel(attrKey, skillKey,false) + "Atak z wykorzystaniem " + weaponName;
      const attackRoll ={
        actor: actor, 
        modyfiers: modyfiers,
        allowFate: useFate,
        rollLabel: rollLabel,
        reRoll : false,
        chat: false,
        agonia: false,
        useManeuver: true,
        attack: true,
      }
      if(target === ""){
        attackRoll.chat = true;
        attackRoll.attack = false
        await CRPRoll.skill(attackRoll)
        return
      }
      else{
      const defenceOption = await this.defenceOption(defenderActor, skillKey)
      const defender = {
        defenderName: defenderActor.name,
        defenderSkillKey: defenceOption,
        defenderId: defenderActor.id,
        reRoll : false,
        chat: false,
        agonia: false,
        useManeuver: true,
        attack: true,
      }
      await CRPRoll.opositeTest({
        attacker: attackRoll,
        defender: defender,
        attack: true,
      })
    }
      

 
  }
  async _prepareRollLabel(attrKey,skillKey){
    const attrName = CONFIG.CRP.attributes[attrKey];
    const skillName = CONFIG.CRP.skills[skillKey];
    return "Test " + skillName + "("+attrName +")"
    
  }
  async getModifiers(skillKey, attrKey){
    const armmorPenelty = -this.getArmorSkillPenalty(skillKey);
    const woundedPenetly = this.system.derived.woundPenalty;
    const modificatorDialog = await this.getSkillModifier()
    let skillValue;
    let attrValue;
    if(this.type === "character"){
      attrValue = this.system.attributes[attrKey].value
      skillValue = this.system.attributes[attrKey].skills[skillKey].value
    }else{
      attrValue = this.system.npc.attributes;
      skillValue = 0;
    }
    if(modificatorDialog.confirmed){
      const customMod = modificatorDialog.modifier;
      const target = attrValue + skillValue + armmorPenelty + woundedPenetly + customMod; 
      const totalMod = armmorPenelty + woundedPenetly + customMod

       return {attrValue, skillValue, armmorPenelty, woundedPenetly, customMod, target, totalMod}
    }else{
      return false
    }   
  }
  getArmorSkillPenalty(skillKey) {
    if (!ARMOR_PENALIZED_SKILLS.has(skillKey)) return 0;
    return Math.max(0, this.getEquippedArmor());
  }
  getEquippedArmor(){
    const equippedArmor = this.system.equipment.armor.id;
    if(equippedArmor){
      const armorItem = this.items.get(equippedArmor);
      return armorItem.system.protection;
    }else{
      return 0
    }

  }
  async spendFate(amount = 1) {
    const current = this.system.resources.fate.value;

    if (current < amount) {
      ui.notifications.warn("Brak punktów Doli!");
      return false;
    }

    await this.update({
      "system.resources.fate.value": current - amount,
    });

    return true;
  }
  async applyWoundsState() {
    const hp = this.system.derived.health.value;

    const update = {};
    const actorType = ["character", "npc-rycerz"].includes(this.type) ? this.type : false;
    if (hp <= 0 && !this.system.state.bleeding && actorType) {
      update["system.state.bleeding"] = true;
      
     await this.toggleStatusEffect("bleeding", { active: true });
    }else if(hp <= 0 && !actorType){
      update["system.state.life"] = "dead";
      await this.toggleStatusEffect("dead", { active: true, overlay: true });
    }

    if (hp > 0 ) {
      update["system.state.bleeding"] = false;
      update["system.state.unconscious"] = false;
      update["system.state.life"] = "alive";
      update["system.state.agony"] = false;
      await this.toggleStatusEffect("unconscious", { active: false });
      await this.toggleStatusEffect("dead", { active: false });
      await this.toggleStatusEffect("bleeding", { active: false });
      await this.toggleStatusEffect("agonia", { active: false });
    }

    if (Object.keys(update).length) {
      await this.update(update);
    }
  }
  async applyDamage(amount) {
    if (amount <= 0) return;

    const hp = this.system.derived.health.value;
    const max = this.system.derived.health.max;

    const currentHp = Number(hp) || 0;
    const newHp = Math.max(-max, currentHp - amount);

    await this.update({
      "system.derived.health.value": newHp,
    });

    await this.applyWoundsState();
  }
  async restoreHealth(amount) {
        if (amount <= 0) return;

    const hp = this.system.derived.health.value;
    const max = this.system.derived.health.max;

    const currentHp = Number(hp) || 0;
    const newHp = Math.max(-max, currentHp + amount);

    await this.update({
      "system.derived.health.value": newHp,
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
          attribute: "derived.health",
          editable: false,
        },
        actorLink: actor.type === "character",
        disposition: actor.type === "character" ? 1 : -1,
      },
      system: {
        resources: {
          advantageUses: {
            value: reasonValue,
          },
        },
      },
    });
  }
  //rzeczy do zrobienia przy updacie Aktora
  async _onUpdate(data, options, user) {
    await super._onUpdate(data, options, user);
    const changeName = data?.name ?? false;
    const actor = this;
    const dependedTokens = actor.getDependentTokens();
    if (changeName && this.type === "character") {
      const tokenName = data.name;
      const dialog = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("CRP.ui.dialog.changeTokenName.title"),
        content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenName.content", { name: tokenName })}</p>`,
      });
      if (dialog) {
        await actor.prototypeToken.update({ name: tokenName });
        for (const token of dependedTokens) {
          await token.update({ name: tokenName });
        }
        this.sheet.render({ force: true });
      }
    }
    const tokenImg = data?.prototypeToken?.texture?.src ?? false;
    if (tokenImg && this.type === "character") {
      const tokenName = data.name;
      const dialog = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("CRP.ui.dialog.changeTokenImage.title"),
        content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenImage.content", { name: tokenName })}</p>`,
      });
      if (dialog) {
        await actor.prototypeToken.update({ name: tokenName });
        for (const token of dependedTokens) {
          await token.update({ ["texture.src"]: tokenImg });
        }
        this.sheet.render({ force: true });
      }
    }
    if (this.sheet.rendered) {
      this.sheet.render();
    }
    const hasExperienceChange = [
      "system.resources.experience",
      "system.resources.experience.value",
      "system.resources.experience.free",
      "system.resources.experience.log",
    ].some((path) => hasChangedPath(data, path));
    const hasManeuverChange = [
      "system.derived.maneuver",
      "system.derived.maneuver.value",
      "system.derived.maneuver.max",
    ].some((path) => hasChangedPath(data, path));

    if (hasExperienceChange && hasManeuverChange) {
      if (hasExperienceChange) {
        CRPAdvancementWindow.refreshForActor(actor);
      }
    }
    if(data.system?.derived?.health?.value !== undefined){
      await this.applyWoundsState();
    }
  }
  async defenceOption(defenderActor, skillKey){
    if(skillKey === "range"){
      return [{skill:"athletics", label:"CRP.defence.evade"}]
    }
    const defenderLeftHand = defenderActor.system.equipment.leftHand;
    const defenderRightHand = defenderActor.system.equipment.rightHand;
    const leftHandItem = await defenderActor.items.get(defenderLeftHand.id)
    const rightHandItem = await defenderActor.items.get(defenderRightHand.id)
    const defendeOption = [{skill:"athletics", label:"CRP.defence.evade"}];
    if(rightHandItem?.type === "weapon" && rightHandItem?.system?.skill !== "range"){
      defendeOption.push({skill:rightHandItem.system.skill, label:"CRP.defence.pary"})
    }
    if(leftHandItem?.type === "weapon" && leftHandItem?.system?.skill !== "range" && rightHandItem !== leftHandItem){
      defendeOption.push({skill:leftHandItem.system.skill, label:"CRP.defence.pary"})
    }
    if(leftHandItem?.type === "shield" || rightHandItem?.type === "shield"){
      defendeOption.push({skill:"shield", label:"CRP.defence.shield"})
    }
    return defendeOption
  }
  async atackRoll(itemId) {
    const item = this.items.get(itemId) ?? null;

    if (item && item.type !== "weapon") {
      ui.notifications.warn("Tarcza nie sluzy do ataku.");
      return;
    }

    const isUnarmedAttack = !item;
    const attackSkill = isUnarmedAttack ? "brawl" : item.system?.skill;
    const itemType = isUnarmedAttack ? "unarmed" : item.type;
    const itemRange = isUnarmedAttack ? "melee" : item.system?.range;
    const attackerMounted = this.system.equipment.mounted;
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
    const defenderMounted = equipment.mounted;

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
      isValidParryWeapon(rightItem) || isValidParryWeapon(leftItem);

    const hasEmptyHand = !equipment.rightHand?.id || !equipment.leftHand?.id;

    const canParry = hasParryWeapon || (isUnarmedAttack && hasEmptyHand);

    const isShield = (item) => item?.type === "shield";

    const hasShield = isShield(rightItem) || isShield(leftItem);

    const mountedAdvantage = attackerMounted && !defenderMounted ? 2 : 0;
    const attackChoice = await getAttackModifier(this, {
      allowManeuvers: !isNPCActor(this),
    }).catch(() => null);

    if (!attackChoice?.confirmed) return;

    const selectedAttackModifier = attackChoice.modifier;
    const maneuverCost = Math.max(0, Number(attackChoice.maneuverCost) || 0);
    const currentManeuver = this.system.derived.maneuver?.value ?? 0;

    if (maneuverCost > currentManeuver) {
      ui.notifications.warn("Brak wystarczającej liczby Punktów Manewru.");
      return;
    }

    if (maneuverCost > 0) {
      await this.update({
        "system.derived.maneuver.value": currentManeuver - maneuverCost,
      });
    }

    const combat = game.combat;
    const combatant = combat?.combatants.find(
      (combatant) => combatant.actor?.id === this.id,
    );
    const aimedAttack = this.getFlag("crp", "aimedAttack");
    const aimedAttackBonus =
      combat?.started &&
      aimedAttack?.combatId === combat.id &&
      aimedAttack?.combatantId === combatant?.id
        ? Number(aimedAttack.bonus) || 3
        : 0;
    const startsAimedAttack =
      attackChoice.maneuver === "aimedAttack" && combat?.started && combatant;
    const oneTimeAimedAttack =
      attackChoice.maneuver === "aimedAttack" && !combat?.started;
    const startsDefensiveAttack =
      attackChoice.maneuver === "defensiveAttack" &&
      combat?.started &&
      combatant;
    const oneTimeDefensiveAttack =
      attackChoice.maneuver === "defensiveAttack" && !combat?.started;

    if (startsAimedAttack) {
      await this.setFlag("crp", "aimedAttack", {
        combatId: combat.id,
        combatantId: combatant.id,
        expiresRound: (combat.round ?? 0) + 1,
        bonus: 3,
      });
    }

    if (startsDefensiveAttack) {
      await this.setFlag("crp", "defensiveAttack", {
        combatId: combat.id,
        combatantId: combatant.id,
        expiresRound: (combat.round ?? 0) + 1,
        bonus: 3,
      });
    }

    if (oneTimeDefensiveAttack) {
      await this.setFlag("crp", "defensiveAttack", {
        oneTime: true,
        bonus: 3,
      });
    }

    const totalAttackModifier =
      attackModifier +
      mountedAdvantage +
      selectedAttackModifier +
      (startsAimedAttack || oneTimeAimedAttack ? 3 : aimedAttackBonus);
    const attr = this._mapSkillToAttribute(attackSkill);
    const allowFate = this.system.resources.fate.value > 0;

    const atackRoll = await CRPRoll.skill(this, attr, attackSkill, {
      chat: false,
      allowFate: allowFate,
      modifier: totalAttackModifier,
      displayModifier: selectedAttackModifier,
    });
    const penalty = this.system.derived.woundPenalty ?? 0;

    Object.assign(atackRoll, {
      name: this.name,
      skill: CONFIG.CRP.skills[attackSkill],
      attr: CONFIG.CRP.attributes[attr],
      displayModifier: selectedAttackModifier,
      rany: penalty !== 0,
      karaRany: penalty,
      pancerz: atackRoll.armorPenalty !== 0,
      allowFate: allowFate,
      reRoll: false,
      modifier:{
        total: totalAttackModifier+penalty-atackRoll.armorPenalty,
        slot: attackModifier,
        mounted: mountedAdvantage,
        selected: selectedAttackModifier,
        aimed: startsAimedAttack || oneTimeAimedAttack ? 3 : aimedAttackBonus,
        karaRany: penalty,
        pancerz: atackRoll.armorPenalty
      },
      testData: {
        attAttr: attr,
        attSkill: attackSkill,
        uuid: this.uuid,
        chat: false,
        allowFate: allowFate,
        modifier: totalAttackModifier,
        displayModifier: selectedAttackModifier,
      },
    });
    const msg = await ChatMessage.create({
      content: "",
      system: {
        crp: {
          defenseChoice: {
            attacker: this.uuid,
            defender: targetActor.uuid,
            attackSkill,
            itemType,
            itemRange,
            totalAttackModifier,
            selectedAttackModifier,
            attackerMounted,
            defenderMounted,
            canParry,
            isRangedAttack,
            hasShield,
            defenceChoice: true,
          },
          atackRoll: atackRoll,
        },
      },
    });
    await msg.regenerateAtakRollContent();
    await msg.update({
      content: msg.content.replace(
        'data-message-id=""',
        `data-message-id="${msg.id}"`,
      ),
    });
  }
  async  getSkillModifier() {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/dialogs/skills.hbs",
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Test umiejętności" },
    classes:["crp-dialog"],
    content,
    buttons: [
      {
        action: "confirm",
        label: "Rzuć",
        default: true,
        callback: (_event, _button, dialog) => {
          const value = Number(
            dialog.element.querySelector("input[name='skillModifier']")
              ?.value ?? 0,
          );
          return {
            confirmed: true,
            modifier: Math.max(
              -4,
              Math.min(4, Number.isFinite(value) ? value : 0),
            ),
          };
        },
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false }),
      },
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
    },
  });
}
async  getManeuver() {
const availableManeuver = this.system.derived.maneuver?.value ?? 0;

const maneuvers = Object.fromEntries(
  Object.entries(CONFIG.CRP.maneuvers).filter(
    ([key, maneuver]) => maneuver.cost <= availableManeuver,
  ),
);
  
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/dialogs/attack.hbs",
    {
      maneuver: this.system.derived.maneuver,
      maneuvers,
    },
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Wybór Manewru" },
    classes:["crp-dialog"],
    content,
    buttons: [
      {
        action: "confirm",
        label: "Atakuj",
        default: true,
        callback: (_event, _button, dialog) => {
          const maneuverSelect = dialog.element.querySelector(
            "select[name='maneuver']",
          );
          const maneuverOption = maneuverSelect?.selectedOptions[0].value;
          const selectedManeuver = CONFIG.CRP.maneuvers[maneuverOption]

          return {
            confirmed: true,
            maneuver: selectedManeuver,
            maneuverCost: selectedManeuver.cost
          };
        },
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false }),
      },
    ],
    render: (_event, dialog) => {
      const maneuverSelect = dialog.element.querySelector(
        "select[name='maneuver']",
      );
      const maneuverDescription = dialog.element.querySelector(
        ".crp-attack-maneuver-description",
      );

      if (maneuverSelect && maneuverDescription) {
        const refreshManeuverDescription = () => {
          const option = maneuverSelect.selectedOptions[0];
          maneuverDescription.textContent = option?.dataset.description ?? "";
        };

        maneuverSelect.addEventListener("change", refreshManeuverDescription);
        refreshManeuverDescription();
      }
    },
  });
}
async spendManeuverPoints(cost){
  const currentManeuverPoint = this.system.derived.maneuver.value;
  const newManeuverPoints = currentManeuverPoint - cost;
  this.update({["system.derived.maneuver.value"]:newManeuverPoints})
  if(this.sheet.rendered){
    this.sheet.render(true)
  }
}
getAttributeKey(skillKey) {
  return Object.entries(this.system.attributes).find(
    ([, attribute]) => Object.hasOwn(attribute.skills, skillKey),
  )?.[0] ?? null;
}
}

function hasChangedPath(changed, path) {
  return (
    foundry.utils.hasProperty(changed, path) || Object.hasOwn(changed, path)
  );
}


