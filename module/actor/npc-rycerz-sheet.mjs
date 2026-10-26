import { CRPActorSheet } from "./actor-sheet.mjs";

export class CRPNPCRycerzSheet extends CRPActorSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/npc-rycerz-sheet.hbs",
    },
  };
}
