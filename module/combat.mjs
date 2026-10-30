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
}
