
import { CRPRoll } from "./rolls/roll.mjs";
import { CRPChatMessage } from "./chat/chatMessage.mjs";
export class CRPCombat extends Combat {
  async nextRound() {
    await super.nextRound();

    const initiatives = [];

    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;

      const rolledInitiative = combatant.flags.crp.initiativeRoll;
      const initiativeBonus = actor.system.derived.initiativeTotal;

      initiatives.push({
        combatant,
        initiative: rolledInitiative + initiativeBonus,
        isCharacter: actor.type === "character",
      });
    }

    // Check for duplicate initiatives.
    for (const current of initiatives) {
      const hasDuplicate = initiatives.some(
        (other) =>
          other.combatant.id !== current.combatant.id &&
          other.initiative === current.initiative,
      );

      if (hasDuplicate && current.isCharacter) {
        current.initiative += 0.1;
      }
    }

    // Update all combatants.
    await Promise.all(
      initiatives.map(({ combatant, initiative }) =>
        combatant.update({ initiative }),
      ),
    );
  }

  async rollInitiative(ids, option) {
    ids = typeof ids === "string" ? [ids] : ids;

    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant?.actor) continue;

      await CRPRoll.initiative(combatant.actor, { combatant });
    }

    return this;
  }

  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);

    const actor = combatant.actor;
    if (!actor) return;

    const maneuver = actor.getFlag("crp", "maneuver");
    if (maneuver) {
      await actor.unsetFlag("crp", "maneuver");
    }

  
    await this.handleConditions(combatant);

    const canMakeManeuver = ["character", "npc-rycerz"].includes(actor.type);
    if (canMakeManeuver) {
      await this.handleManeuver(combatant);
    }

    // Refresh actor sheet.
    if (actor.sheet?.rendered) {
      await actor.sheet.render(true);
    }
  }

async handleConditions(combatant) {
  const actor = combatant.actor;
  if (!actor) return;

  const state = actor.system.state;

  if (state.life === "dead" || !state.bleeding) return;
  if (!["character", "npc-rycerz"].includes(actor.type)) return;

  const hasConnectedOwner = game.users.some(
    (user) =>
      user.active &&
      actor.testUserPermission(user, "OWNER") &&
      !user.isGM,
  );

  let result;

  if (actor.type === "character" && hasConnectedOwner) {
    result = await game.system.socketHandler.requestFortitudeRoll(actor);
  } else {
    result = await actor.rollSkill({
      attrKey: "strength",
      skillKey: "endurance",
      reRoll: false,
      allowFate: false,
      agonia:true
    });
  }

  if (!result) return;

  if (!result.success) {
    if (state.agony) {
      await actor.update({ "system.state.life": "dead" });
      await actor.toggleStatusEffect("dead", { active: true });
    } else if (state.unconscious) {
      await actor.update({ "system.state.agony": true });
      await actor.toggleStatusEffect("agonia", { active: true });
    } else if (state.bleeding) {
      await actor.update({ "system.state.unconscious": true });
      await actor.toggleStatusEffect("unconscious", { active: true });
    }
  }
}



  async handleManeuver(combatant) {
    const actor = combatant.actor;
    if (!actor) return;

    const hasConnectedOwner = game.users.some(
      (user) =>
        user.active &&
        actor.testUserPermission(user, "OWNER") &&
        !user.isGM,
    );

    if (actor.type === "character" && hasConnectedOwner) {
      game.system.socketHandler.emit({
        operation: "selectManeuver",
        actorId: actor.id,
        combatantId: combatant.id
      });
    } else {
      const selectedManeuver = await actor.getManeuver();
      if(selectedManeuver.confirmed){
        await actor.setFlag("crp", "maneuver", selectedManeuver.maneuver);
        await actor.spendManeuverPoints(selectedManeuver.maneuverCost)
        Object.assign(selectedManeuver.maneuver,{actor: actor, madeTest: false})
        const chat=  await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        system: {crp: selectedManeuver.maneuver}
      })
        await chat.maneuverToChat()
      }   
    }
  }

  async endCombat(){
    await super.endCombat()
    const combatants = this.combatants;
    combatants.forEach(async (combatant) =>{
      await combatant.actor.unsetFlag("crp", "maneuver");
    })
  }
}
