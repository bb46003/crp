import { CRPActorSheet } from "./actor-sheet.mjs";

export class CRPNPCKnechtSheet extends CRPActorSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/npc-knecht-sheet.hbs",
    },
  };
}
