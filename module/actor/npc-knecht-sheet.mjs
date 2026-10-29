import { CRPActorSheet } from "./actor-sheet.mjs";

export class CRPNPCKnechtSheet extends CRPActorSheet {
   static DEFAULT_OPTIONS = {
        position: {
      width: 970,
      height: 860,
    },
   }
  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/npc-knecht-sheet.hbs",
    },
        equipment: {
      id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-equipment.hbs",
    },
    attributes: {
      id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-attributes.hbs",
    },
  };
}
