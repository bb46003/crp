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
    const maneuver = combatant.actor.getFlag("crp", "manuver");

      if (this.round >= maneuver?.expiresRound
      ) {
        await combatant.actor.unsetFlag("crp", "manuver");
      }
    
    
    if (combatant.actor.system.state.life === "dead") return;
    if (!combatant.actor.system.state.bleeding) return;
    if(combatant.actor.type !=="character" && !combatant.actor.type !== "npc-rycerz") return;
    let result
      const hasConnectedOwner = game.users.some(
    user =>
      user.active &&
      combatant.actor.testUserPermission(user, "OWNER") &&
      !user.isGM
  );
  if (combatant.actor.type === "character" && hasConnectedOwner) {



    game.socket.emit("system.crp", {
      type: "fortitudeRoll",
      actorId: combatant.actor.id,
    });
  
    }else{
    result = await CRPRoll.fortitude(combatant.actor, { chat: true });
    }
    if (!result) return;
    const stan = combatant.actor.system.state;
    if(stan.bleeding && !result.success){
      await combatant.actor.update({
        "system.state.unconscious": true,
      });
      combatant.actor.toggleStatusEffect("unconscious", {active:true});
    }
    if(stan.unconscious && !result.success){
      await combatant.actor.update({
        "system.state.agony": true,
      });
      combatant.actor.toggleStatusEffect("agonia", {active:true});
    }
    if(stan.agony && !result.success){
      await combatant.actor.update({
        "system.state.life": "dead",
      });c
      combatant.actor.toggleStatusEffect("dead", {active:true});
    }
    const canMakeManuver = combatant.actor.system.derived.maneuver.vale;
    if(canMakeManuver > 0){
      
    }
    // =====================
    // LOGIKA STANÓW (NA AKTUALNYM STANIE)
    // =====================

    // odśwież UI (opcjonalne, ale OK)
    if(combatant.actor.sheet?.rendered){
    await combatant.actor.sheet?.render(true);
    }
  }
}
