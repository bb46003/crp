import { CRPActorSheet } from "./actor-sheet.mjs";

export class CRPNPCCommonerSheet extends CRPActorSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/npc-commoner-sheet.hbs",
    },
  };
}
