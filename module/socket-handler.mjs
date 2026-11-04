import { CRPRoll } from "./rolls/roll.mjs";

export class CRPSocketHandler {
  constructor() {
    this.identifier = "system.crp";
    this.pendingRequests = new Map();

    this.registerSocketEvents();
  }

  registerSocketEvents() {
    game.socket.on(this.identifier, async (data) => {
      switch (data.operation) {
        case "fortitudeRoll": {
          const actor = game.actors.get(data.actorId);

          // Only the client assigned to this character performs the roll.
          if (!actor || game.user.character?.id !== actor.id) return;

          try {
            const result = await actor.rollSkill({
              attrKey: "strength",
              skillKey: "endurance",
              reRoll: false,
              allowFate: false,
              agonia:true
            });

            this.emit({
              operation: "fortitudeRollResult",
              requestId: data.requestId,
              actorId: actor.id,
              success: result.success,
            });
          } catch (error) {
            console.error("CRP | Fortitude roll failed", error);

            this.emit({
              operation: "fortitudeRollResult",
              requestId: data.requestId,
              actorId: actor.id,
              error: true,
            });
          }

          break;
        }

        case "fortitudeRollResult": {
          const request = this.pendingRequests.get(data.requestId);
          if (!request) return;

          if (request.actorId !== data.actorId) return;

          clearTimeout(request.timeout);
          this.pendingRequests.delete(data.requestId);

          request.resolve(data.error ? null : {
            success: data.success,
          });

          break;
        }
        case "selectManuver":{
          const actor = game.actors.get(data.actorId);
        // Only the client assigned to this character performs the roll.
          if (!actor || game.user.character?.id !== actor.id) return;
          const selectedManuver = await actor.getManuver();
          if(selectedManuver.confirmed){
            const combatant = game.combat.combatants.get(data.combatantId);
            await combatant.setFlag("crp", "maneuver", selectedManuver.maneuver);
            await actor.spendManuverPoints(selectedManuver.maneuverCost)
          }          
          break;
        }
      }
    });
  }

  /**
   * Request a Fortitude roll from the assigned player.
   * Returns a Promise resolving with the roll result.
   */
  requestFortitudeRoll(actor, timeoutDuration = 120000) {
    const requestId = foundry.utils.randomID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        console.warn(`CRP | Fortitude roll timeout: ${actor.name}`);
        resolve(null);
      }, timeoutDuration);

      this.pendingRequests.set(requestId, {
        actorId: actor.id,
        resolve,
        timeout,
      });

      game.system.socketHandler.emit({
        operation: "fortitudeRoll",
        actorId: actor.id,
        requestId,
      });
    });
  }

  emit(data) {
    return game.socket.emit(this.identifier, data);
  }
}