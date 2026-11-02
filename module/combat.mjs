import { CRPRoll } from "./rolls/roll.mjs";

export class CRPCombat extends Combat {
  async nextRound() {
    super.nextRound();

    const combatants = this.combatants;
    const initiatives = [];

    // Calculate initiative for all combatants
    for (const combatant of combatants) {
      const rolledInitiative = combatant.flags.crp.initiativeRoll;
      const actor = combatant.actor;
      const initiativeBonus = actor.system.derived.initiativeTotal;

      initiatives.push({
        combatant,
        initiative: rolledInitiative + initiativeBonus,
        isCharacter: actor.type === "character",
      });
    }

    // Check for duplicate initiatives
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

    // Update all combatants
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
      if (!combatant) continue;

      const actor = combatant.actor;
      if (!actor) continue;

      // NASZ SYSTEM
      await CRPRoll.initiative(actor, { combatant });
    }

    return this;
  }

  async _onStartTurn(combatant,context,){
    super._onStartTurn(combatant,context);
    for (const flagName of ["aimedAttack", "defensiveAttack"]) {
      const maneuver = combatant.actor.getFlag("crp", flagName);

      if (this.round >= maneuver?.expiresRound
      ) {
        await combatant.actor.unsetFlag("crp", flagName);
      }
    }
    
    if (combatant.actor.system.state.life === "dead") return;
    if (!combatant.actor.system.state.bleeding) return;
    let result
    if(combatant.actor.type ==="character"){
      //soket do gracza o tym że jego postać krwawi i musi wykonać test tężyzny
      game.socket.emit("system.crp", {
        type: "fortitudeRoll",
        actorId: combatant.actor.id,
      });
      
    }else{
    result = await CRPRoll.fortitude(combatant.actor, { chat: true });
    }
    if (!result) return;

    // =====================
    // LOGIKA STANÓW (NA AKTUALNYM STANIE)
    // =====================

    if (!combatant.actor.system.state.unconscious) {
      // był przytomny → może stracić przytomność
      if (!result.success) {
        await combatant.actor.update({
          "system.state.unconscious": true,
        });
        combatant.actor.toggleStatusEffect("unconscious", { active: true });
        ui.notifications.info(`${combatant.name} traci przytomność!`);
      }
    } else {
      // był nieprzytomny → może umrzeć
      if (!result.success) {
        await combatant.actor.update({
          "system.state.life": "dead",
          "system.state.bleeding": false,
          "system.state.unconscious": false,
        });
        combatant.actor.toggleStatusEffect("dead", { active: true });
        ui.notifications.info(`${combatant.name} umiera!`);
      }
    }
    // odśwież UI (opcjonalne, ale OK)
    if(combatant.actor.sheet?.rendered){
    await combatant.actor.sheet?.render(true);
    }
  }
}
