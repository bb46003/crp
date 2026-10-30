import { CRPRoll } from "../rolls/roll.mjs";

export class CRPChatLog extends foundry.applications.sidebar.tabs.ChatLog {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: [...(super.DEFAULT_OPTIONS.classes ?? []), "crp-chat-log"],
    actions: {
      ...super.DEFAULT_OPTIONS.actions,
      useFate: CRPChatLog.#onUseFate,
      damageChoice: CRPChatLog.#onDamageChoice,
      defenseChoice: CRPChatLog.#onDefenseChoice,
    },
  };
  static async #onDamageChoice(event, target) {
    event.preventDefault();

    const button = target;
    if (button.classList.contains("used")) return;

    // Tutaj przenieś logikę użycia Doli.
  }

  static async #onUseFate(event, target) {
    event.preventDefault();

    const messageId = target.closest(".crp-chat").dataset.messageId;
    const message = game.messages.get(messageId);
    const crp = message.system.crp;
    const type = target.dataset.type;

    let roll;
    let actor;
    let attr;
    let skill;
    let modifier;
    let displayModifier;

    switch (type) {
      case "defenceRoll": {
        roll = crp.defenceRoll;
        actor = await fromUuid(roll.testData.uuid);

        const spendFate = await actor.spendFate(1);
        if (!spendFate) return;

        attr = roll.defAttr;
        skill = roll.defSkill;
        modifier = roll.modifier;
        displayModifier = roll.displayModifier;
        break;
      }

      case "atackRoll": {
        roll = crp.atackRoll;
        actor = await fromUuid(roll.testData.uuid);
        const spendFate = await actor.spendFate(1);
        if (!spendFate) return;
        attr = roll.testData.attAttr;
        skill = roll.testData.attSkill;
        modifier = roll.modifier;
        displayModifier = roll.displayModifier;
        break;
      }

      default:
        return;
    }

    // Perform the reroll once.
    const reroll = await CRPRoll.skill(actor, attr, skill, {
      chat: false,
      allowFate: false,
      modifier,
      displayModifier,
    });

    // Merge the reroll with the existing roll data.
    const updatedRoll = foundry.utils.mergeObject(roll, reroll, {
      inplace: false,
    });

    updatedRoll.allowFate = false;
    updatedRoll.reRoll = true;
    const updateData = {
      [`system.crp.${type}`]: updatedRoll,
    };

    if (type === "atackRoll" && crp.defenceRoll) {
      const defenceRoll = crp.defenceRoll;
      const defenderActor = await fromUuid(crp.defenceRoll.testData.uuid);
      const defenseType = crp.defenceRoll.defenseType;
      const {damage, baseDamage,reduction} = damageCalculation(reroll,defenceRoll,defenderActor,defenseType)
      updateData["system.crp.winner"] = defnieWinner(
        updatedRoll,
        crp.defenceRoll,
      );
      updateData['system.crp.damageResult.total'] = damage;
      updateData['system.crp.damageResult.base'] = baseDamage
      updateData['system.crp.damageResults.reduction'] = reduction
    } else if (type === "defenceRoll") {
      updateData["system.crp.winner"] = defnieWinner(
        crp.atackRoll,
        updatedRoll,
      );
      const defenceRoll = crp.defenceRoll;
      const defenderActor = await fromUuid(crp.defenceRoll.testData.uuid);
      const defenseType = crp.defenceRoll.defenseType;
      const {damage, baseDamage, reduction} = damageCalculation(reroll,defenceRoll,defenderActor,defenseType)
      updateData['system.crp.damageResult.total'] = damage;
      updateData['system.crp.damageResult.base'] = baseDamage
      updateData['system.crp.damageResults.reduction'] = reduction
    }
    await message.update(updateData);
    await message.regenerateAtakRollContent();
  }

  static async #onDefenseChoice(event, target) {
    event.preventDefault();
    const messageId = target.closest(".crp-chat").dataset.messageId;
    const message = await game.messages.get(messageId);
    const {
      defender,
      skill,
      itemType,
      isRangedAttack,
      defenderMounted,
      attackerMounted,
    } = message.system.crp.defenseChoice;
    const atackRoll = message.system.crp.atackRoll;
    const defenseType = target.dataset.defense;
    const defenderActor = await fromUuid(defender);

    if (!defenderActor) return;

    if (!game.user.isGM && !defenderActor.isOwner) {
      ui.notifications.warn("Nie kontrolujesz tej postaci");
      return;
    }

    const mountedDefenseModifier = defenderMounted && !attackerMounted ? 2 : 0;
    let defenseModifier = mountedDefenseModifier;
    let defSkill;

    const equipment = defenderActor.system.equipment;
    const handItems = ["rightHand", "leftHand"].map((slot) => {
      const id = equipment[slot]?.id;
      return id ? defenderActor.items.get(id) : null;
    });

    const getCombatModifier = ({ item, skill, unarmed = false } = {}) => {
      if (unarmed) return -3;
      if (item?.type !== "weapon") return 0;
      if (item.system.range === "ranged" || skill === "ranged") return 2;
      if (skill === "lightWeapons") return -1;
      if (skill === "twoHanded") return 3;
      return 1;
    };

    const getTotal = (skill) => {
      if (!skill) return -999;

      const attr = defenderActor._mapSkillToAttribute(skill);
      if (!attr) return -999;

      const attributes = defenderActor.system.attributes[attr];
      return (
        (attributes?.value ?? 0) + (attributes?.skills?.[skill]?.value ?? 0)
      );
    };

    if (defenseType === "parry") {
      if (itemType === "weapon" && isRangedAttack) {
        ui.notifications.warn("Nie można parować ataku dystansowego");
        return;
      }

      const candidates = handItems
        .filter(
          (item) => item?.type === "weapon" && item.system.range !== "ranged",
        )
        .map((item) => ({
          skill: item.system.skill,
          modifier: getCombatModifier({ item, skill: item.system.skill }),
        }));

      if (itemType === "unarmed" && handItems.some((item) => !item)) {
        candidates.push({
          skill: "brawl",
          modifier: getCombatModifier({ unarmed: true }),
        });
      }

      const best = candidates.sort(
        (a, b) =>
          getTotal(b.skill) + b.modifier - getTotal(a.skill) - a.modifier,
      )[0];

      if (!best) {
        ui.notifications.warn(
          itemType === "unarmed"
            ? "Brak wolnej ręki lub broni do parowania"
            : "Brak broni do parowania",
        );
        return;
      }

      defSkill = best.skill;
      defenseModifier += best.modifier;
    } else if (defenseType === "dodge") {
      defSkill = "athletics";
      defenseModifier = defenderMounted ? -2 : mountedDefenseModifier;
    } else if (defenseType === "shield") {
      if (!handItems.some((item) => item?.type === "shield")) {
        ui.notifications.warn("Brak tarczy");
        return;
      }

      defSkill = "shield";
      defenseModifier += 1;
    }

    const combat = game.combat;
    const combatant = combat?.combatants.find(
      (c) => c.actor?.id === defenderActor.id,
    );
    const defensiveAttack = defenderActor.getFlag("crp", "defensiveAttack");

    const defensiveAttackBonus = defensiveAttack?.oneTime
      ? Number(defensiveAttack.bonus) || 3
      : combat?.started &&
          defensiveAttack?.combatId === combat.id &&
          defensiveAttack?.combatantId === combatant?.id
        ? Number(defensiveAttack.bonus) || 3
        : 0;

    if (defensiveAttackBonus) {
      defenseModifier += defensiveAttackBonus;

      if (defensiveAttack.oneTime) {
        await defenderActor.unsetFlag("crp", "defensiveAttack");
      }
    }
    const defAttr = defenderActor._mapSkillToAttribute(defSkill);
    const selectedDeffModifier =
      defenseType === "dodge" && defenderMounted ? -2 : 0;
    const allowFate = defenderActor.system.resources.fate.value > 0;
    const defenceRoll = await CRPRoll.skill(defenderActor, defAttr, defSkill, {
      chat: false,
      allowFate: allowFate,
      modifier: defenseModifier,
      displayModifier: selectedDeffModifier,
    });
    const penalty = defenderActor.system.derived.woundPenalty ?? 0;

    Object.assign(defenceRoll, {
      name: defenderActor.name,
      skill: CONFIG.CRP.skills[defSkill],
      attr: CONFIG.CRP.attributes[defAttr],
      displayModifier: selectedDeffModifier,
      defenseType: defenseType,
      rany: penalty > 0,
      karaRany: penalty,
      pancerz: defenceRoll.armorPenalty > 0,
      allowFate: allowFate,
      testData: {
        defSkill: defSkill,
        defAttr: defAttr,
        uuid: defenderActor.uuid,
        chat: false,
        allowFate: allowFate,
        modifier: defenseModifier,
        displayModifier: selectedDeffModifier,
      },
    });
    const winner = defnieWinner(atackRoll, defenceRoll);
    const {damage, baseDamage,reduction,armorProtection,shieldProtection} = damageCalculation(atackRoll,defenceRoll,defenderActor,defenseType)
    const attackEagles = atackRoll?.eagles ?? 0;
    const attackShields = atackRoll?.shields ?? 0;
    const hasAttackModifiers = attackEagles !== 0 || attackShields !== 0;

    const defenderFate = defenderActor.system.resources.fate.value ?? 0;
    const needsDamageChoice = damage > 0 && defenderFate > 0;
    const autoDamage = damage > 0 && defenderFate < 1;

    if (autoDamage) await defenderActor.applyDamage(damage);
    const defenseResult = {
      label:
        {
          parry: "Parowanie",
          dodge: "Unik",
          shield: "Tarcza",
        }[defenseType] ?? defenseType,
    };
    const damageResult = {
      base: baseDamage,
      armorProtection:armorProtection,
      shieldProtection: shieldProtection,
      reduction,
      hasAttackModifiers,
      total: damage,
      needsDamageChoice: needsDamageChoice
    };
    await message.update({
      system: {
        crp: {
          defenceRoll: defenceRoll,
          damageResult: damageResult,
          defenseResult: defenseResult,
          defenseChoice: {
            defenceChoice: false,
          },
          winner: winner,
        },
      },
    });
    await message.regenerateAtakRollContent();
  }
}

function defnieWinner(atackRoll, defenceRoll) {
  let winner;
  if (
    atackRoll.critical === "criticalSuccess" &&
    defenceRoll.critical === "criticalSuccess"
  ) {
    winner = "tie";
  } else if (atackRoll.critical === "criticalSuccess") {
    winner = "A";
  } else if (defenceRoll.critical === "criticalSuccess") {
    winner = "B";
  } else if (
    atackRoll.critical === "criticalFailure" &&
    defenceRoll.critical === "criticalFailure"
  ) {
    winner = "tie";
  } else if (atackRoll.critical === "criticalFailure") {
    winner = "B";
  } else if (defenceRoll.critical === "criticalFailure") {
    winner = "A";
  } else {
    if (atackRoll.margin > defenceRoll.margin) {
      winner = "A";
    } else if (defenceRoll.margin > atackRoll.margin) {
      winner = "B";
    } else {
      winner = "tie";
    }
  }
  return winner;
}

function damageCalculation(atackRoll, defenceRoll, defenderActor,defenseType){
  const marginA = atackRoll?.margin ?? 0;
    const marginB = defenceRoll?.margin ?? 0;
    const baseDamage = Math.max(0, marginA - marginB);

    const attackEagles = atackRoll?.eagles ?? 0;
    const attackShields = atackRoll?.shields ?? 0;

    let damage = Math.max(0, baseDamage + attackEagles - attackShields);
     const equipment = defenderActor.system.equipment;
    const armorProtection =
      defenderActor.items.get(equipment.armor?.id)?.system?.protection ?? 0;

    const shieldProtection =
      defenseType === "shield"
        ? Math.max(
            ...handItems.map((item) =>
              item?.type === "shield"
                ? Number(item.system?.protection) || 0
                : 0,
            ),
          )
        : 0;

    const defenseEagles = defenceRoll?.eagles ?? 0;
    const defenseShields = defenceRoll?.shields ?? 0;

    const reduction = Math.max(
      0,
      armorProtection + shieldProtection + defenseEagles - defenseShields,
    );
    damage = Math.max(0, damage - reduction)
    return {damage,baseDamage,reduction,armorProtection,shieldProtection};
}