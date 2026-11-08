import { CRPRoll } from "../rolls/roll.mjs";

export class CRPChatLog extends foundry.applications.sidebar.tabs.ChatLog {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: [...(super.DEFAULT_OPTIONS.classes ?? []), "crp-chat-log"],
    actions: {
      ...super.DEFAULT_OPTIONS.actions,
      useFate: CRPChatLog.#onUseFate,
      damageChoice: CRPChatLog.#onDamageChoice,
      applyDamage: CRPChatLog.#onApplyDamage,
      restoreHealth: CRPChatLog.#onRestoreHealth,
      maneuverTest: CRPChatLog.#maneuverTest,
      opositeTest: CRPChatLog.#opositeTest,  
    },
  };

  static async #onApplyDamage(event, target) {
    event.preventDefault();
    const messageId = target.closest(".crp-chat").dataset.messageId;
    const message = await game.messages.get(messageId);
    const crp = message.system.crp;
    const defenderUuid = crp.defender.defenderId;
    const defenderActor = await fromUuid(defenderUuid);
    if(game.user.isGM || defenderActor.isOwner){
      const damage = crp.damage.total;
      await defenderActor.applyDamage(damage);
      await message.update({
        "system.crp.damage.canApplyDamage": false,
      });
      message.regenerateOpositeRoll();
    } else {
      ui.notifications.warn("Nie kontrolujesz tej postaci");
    }
  }
    static async #onRestoreHealth(event, target) {
    event.preventDefault();
    const messageId = target.closest(".crp-chat").dataset.messageId;
    const message = await game.messages.get(messageId);
    const crp = message.system.crp;
    const defenderUuid = crp.defender.defenderId;
    const defenderActor = await fromUuid(defenderUuid);
    if(game.user.isGM || defenderActor.isOwner){
      const damage = crp.damage.total;
      await defenderActor.restoreHealth(damage);
      await message.update({
        "system.crp.damage.canApplyDamage": true,
      });
      message.regenerateOpositeRoll();
    } else {
      ui.notifications.warn("Nie kontrolujesz tej postaci");
    }
  }
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
    const isOposite = target.closest(".crp-oposite-roll") !== null
    const ataker = target.closest(".crp-attaker");
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
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.warn("Nie kontrolujesz tej postaci");
          return;
        }
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
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.warn("Nie kontrolujesz tej postaci");
          return;
        }
        const spendFate = await actor.spendFate(1);
        if (!spendFate) return;
        attr = roll.testData.attAttr;
        skill = roll.testData.attSkill;
        modifier = roll.modifier;
        displayModifier = roll.displayModifier;
        break;
      }
      case "skillRoll": {

        roll = crp;
        if(isOposite){

          if(ataker){
            actor = await fromUuid(roll.atackerRoll.uuid);
          }else{
            actor = await fromUuid(roll.defenderRoll.uuid);
          }
        }else{
          actor = await game.actors.get(roll.actor._id);
        }
        if (!game.user.isGM && !actor.isOwner) {
          ui.notifications.warn("Nie kontrolujesz tej postaci");
          return;
        }
        if(isOposite){
          if(ataker){
            roll.atackerRoll.reRoll = true;
            roll.atackerRoll.allowFate = false; 
            roll.atackerRoll.chat = false
            const spendFate = await actor.spendFate(1);
            if (!spendFate) return;
            const atackerRoll = await CRPRoll.skill(roll.atackerRoll);
            atackerRoll.resultsText = "";
            atackerRoll.rollLabel += " Wynik Po użyciu Doli"
            if(roll.defenderRoll){
              await CRPRoll.opositeTest({
               attacker: roll.attacker,
               atackerRoll: atackerRoll,
               defender: roll.defender,
               defenderRoll: roll.defenderRoll,
               messageId: messageId,
               attack: roll.attack              })
            }else{
            message.update({["system.crp.atackerRoll"]:atackerRoll})
            message.regenerateOpositeRoll()
            }
          }else{
            roll.defenderRoll.reRoll = true;
            roll.defenderRoll.allowFate = false; 
            roll.defenderRoll.chat = false;
            roll.defenderRoll.actor = actor;
            const spendFate = await actor.spendFate(1);
            if (!spendFate) return;
            const defenderRoll = await CRPRoll.skill(roll.defenderRoll);
            defenderRoll.resultsText = "";
            defenderRoll.rollLabel += " Wynik po użyciu Doli"
              await CRPRoll.opositeTest({
               attacker: roll.attacker,
               atackerRoll: roll.atackerRoll,
               defender: roll.defender,
               defenderRoll: defenderRoll,
               messageId: messageId,
               attack: roll.attack  
              })
          }
        }else{
        const spendFate = await actor.spendFate(1);
        if (!spendFate) return;
        await CRPRoll.skill({
          actor: actor, 
          modyfiers: crp.modyfiers,
          allowFate: false,
          rollLabel: crp.rollLabel + "przerzut z Użycia Doli",
          reRoll : true,
          chat: true
        })

          await message.update({["system.crp.usedFate"]:true})
          message.regenerateSkillRoll()
        }
        return;
      }
      default:
        return;
    }
  }

static async #maneuverTest(event, target) {
  event.preventDefault();

  const messageId = target.closest(".crp-chat").dataset.messageId;
  const message = game.messages.get(messageId);
  const maneuver = message.system.crp;
  const attacker = await game.actors.get(maneuver.actor._id);
  const targets = [...game.user.targets];
  const requireOpponent = maneuver.oponentTest !== "none";
  const requireOwnTest = maneuver.ownTest !== "none";

  if (targets.length > 1 && requireOpponent) {
    ui.notifications.info("Wybierz tylko jeden cel");
    return;
  }

  if (targets.length === 0 && requireOpponent) {
    ui.notifications.info("Wybierz cel");
    return;
  }

  if (requireOwnTest && !requireOpponent) {
    
    const skillKey = maneuver.ownTest;
    const attrKey = attacker.getAttributeKey(skillKey);

    await attacker.rollSkill({
      attrKey: attrKey, 
      skillKey: skillKey,
      reRoll:false,
      allowFate: true,
      agonia: false,
      chat: true,
      useManeuver: true})
    maneuver.madeTest = true;
    message.update({['system.crp']: maneuver})
    message.maneuverToChat()
    return
  }
  if(requireOwnTest && requireOpponent){
    const defenderActor = targets[0];
    await attacker.opositeTest({
      attacker:{
        actor: attacker.id,
       attackerSkillKey: maneuver.ownTest,
       attackerAttrKey: attacker.getAttributeKey(maneuver.ownTest),
        allowFate:true,
        reRoll:false,
        useManeuver:true,
        chat: false,
        agonia:false
      },
      defender:{
        defenderId: defenderActor.actor.uuid,
        defenderName: defenderActor.name,
        defenderSkillKey: maneuver.oponentTest,
        allowFate:true,
        reRoll:false,
        useManeuver:true,
        chat: false,
        agonia:false
      }
    })
    maneuver.madeTest = true;
    message.update({['system.crp']: maneuver})
    message.maneuverToChat()
  }
}
static async #opositeTest(event,target){
  event.preventDefault();
  const messageId = target.closest(".crp-chat").dataset.messageId;
  const message = game.messages.get(messageId);
  const selectedSkill = target.dataset.skill;
  const shield = target.dataset.shield === "true";
  const data = message.system.crp;
  data.defender.defenderSkill = selectedSkill
  const defenderData = data.defender;
  const defenderActor = await fromUuid(defenderData.defenderId);
  Object.assign(data.defender,{shield:shield})
  await defenderActor.opositeTest({
    attacker: data.attacker,
    atackerRoll: data.atackerRoll,
    defender: data.defender,
    atackRoll: true,
    messageId: messageId,
    attack: data.attack,
  })
}
}



