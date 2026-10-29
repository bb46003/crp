import { CRPActorSheet } from "./actor-sheet.mjs";

export class CRPNPCRycerzSheet extends CRPActorSheet {
     static DEFAULT_OPTIONS = {
        position: {
      width: 970,
      height: 860,
    },
   }
  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/npc-rycerz-sheet.hbs",
    },
    bio: {
      id: "tabs",
      template: "systems/crp/templates/actor/tabs/rycerz-tab-bio.hbs",
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
