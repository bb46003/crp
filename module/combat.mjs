
import { CRPRoll } from "./rolls/roll.mjs";
import {CRPSocketHandler} from "./socket-handler.mjs"

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

    // Check maneuver expiration.
    const maneuver = actor.getFlag("crp", "manuver");

    if (maneuver && this.round >= maneuver.expiresRound) {
      await actor.unsetFlag("crp", "manuver");
    }

    // Wait until all conditions are resolved.
    await this.handleConditions(combatant);

    // Handle maneuver selection.
    const canMakeManeuver = ["character", "npc-rycerz"].includes(actor.type);

    if (canMakeManeuver) {
      await this.handleManuver(combatant);
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

    if (state.life === "dead") return;
    if (!state.bleeding) return;

    if (!["character", "npc-rycerz"].includes(actor.type)) return;

    const hasConnectedOwner = game.users.some(
      (user) =>
        user.active &&
        actor.testUserPermission(user, "OWNER") &&
        !user.isGM,
    );
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
    result = await CRPSocketHandler.requestFortitudeRoll(actor);
  } else {
    result = await actor.rollSkill({
      attr: "strength",
      skill: "endurance",
      reRoll: false,
      allowFate: false,
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



  async handleManuver(combatant) {
    const actor = combatant.actor;
    if (!actor) return;

    const hasConnectedOwner = game.users.some(
      (user) =>
        user.active &&
        actor.testUserPermission(user, "OWNER") &&
        !user.isGM,
    );

    if (actor.type === "character" && hasConnectedOwner) {
      game.socket.emit("system.crp", {
        type: "selectManuver",
        actorId: actor.id,
      });
    } else {
      const selectedManuver = await actor.getManuver();
      console.log(selectedManuver);
    }
  }
}
