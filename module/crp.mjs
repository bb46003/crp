// module/crp.mjs

import { CRPActor } from "./actor/actor.mjs";
import {  CRPActorData,  CRPNPCKnechtData,  CRPNPCRycerzData,} from "./actor/actor-data.mjs";
import { CRP } from "./config.mjs";
import { CRPActorSheet } from "./actor/actor-sheet.mjs";
import { CRPNPCKnechtSheet } from "./actor/npc-knecht-sheet.mjs";
import { CRPNPCRycerzSheet } from "./actor/npc-rycerz-sheet.mjs";
import { CRPGMPanel } from "./gm-panel.mjs";
import { CRPItem } from "./item/item.mjs";
import {  CRPWeaponData,  CRPArmorData,  CRPShieldData,  CRPStuffData,  CRPLanguageData,  CRPOriginData,  CRPTraitData,} from "./item/item-data.mjs";
import {  CRPWeaponSheet,  CRPArmorSheet,  CRPShieldSheet,  CRPStuffSheet,  CRPLanguageSheet,  CRPOriginSheet,  CRPTraitSheet,} from "./item/item-sheet.mjs";
import { CRPCombat } from "./combat.mjs";
import { registerHandlebarsHelpers } from "./handlebars.mjs";
import { CRPToken } from "./tokens.mjs";
import { CRPChatMessage } from "./chat/chatMessage.mjs";
import { CRPChatLog } from "./chat/chatLog.mjs";
import { SocketHandler } from "./socket-handler.mjs";

Hooks.once("init", () => {
  game.settings.register("crp", "characterSheetsLocked", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: refreshCharacterSheetLocks,
  });

  // NAJPIERW MODELE ITEMÓW (PRZED WSZYSTKIM)
  CONFIG.Item = CONFIG.Item || {};
  CONFIG.Item.documentClass = CRPItem;

  CONFIG.Item.dataModels = {
    weapon: CRPWeaponData,
    armor: CRPArmorData,
    shield: CRPShieldData,
    stuff: CRPStuffData,
    language: CRPLanguageData,
    origin: CRPOriginData,
    trait: CRPTraitData,
    flaw: CRPTraitData,
  };

  CONFIG.Actor.documentClass = CRPActor;

  CONFIG.Actor.dataModels = {
    character: CRPActorData,
    npc: CRPActorData,
    "npc-knecht": CRPNPCKnechtData,
    "npc-rycerz": CRPNPCRycerzData,
    creature: CRPActorData,
  };

  CONFIG.CRP = CRP;
  CONFIG.Combat.documentClass = CRPCombat;
  foundry.documents.collections.Actors.registerSheet("crp", CRPActorSheet, {
    types: ["character"],
    makeDefault: true,
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCKnechtSheet, {
    types: ["npc"],
    makeDefault: true,
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCKnechtSheet, {
    types: ["npc-knecht"],
    makeDefault: true,
  });

  foundry.documents.collections.Actors.registerSheet("crp", CRPNPCRycerzSheet, {
    types: ["npc-rycerz"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPWeaponSheet, {
    types: ["weapon"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPArmorSheet, {
    types: ["armor"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPShieldSheet, {
    types: ["shield"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPStuffSheet, {
    types: ["stuff"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPLanguageSheet, {
    types: ["language"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPOriginSheet, {
    types: ["origin"],
    makeDefault: true,
  });

  foundry.documents.collections.Items.registerSheet("crp", CRPTraitSheet, {
    types: ["trait", "flaw"],
    makeDefault: true,
  });

  CONFIG.Combat = CONFIG.Combat || {};
  CONFIG.Token.objectClass = CRPToken;

  CRPToken.initializeHooks();
  // ======================
  // OVERRIDE INITIATIVE ROLL
  // ======================
  game.socket
  CONFIG.ChatMessage.documentClass = CRPChatMessage;
  CONFIG.ui.chat = CRPChatLog;
  CONFIG.statusEffects["agonia"] = {
  id: "agonia",
  name: "CRP.Status.Agonia",
  img: "systems/crp/assets/agonia.png",
  hud: true,
};
  game.system.socketHandler = new SocketHandler();
  registerHandlebarsHelpers();
});
Hooks.on("getSceneControlButtons", (controls) => {
  controls.tokens.tools.crpTools = {
    name: "crpTools",
    title: "CRP GM Panel",
    icon: "",
    button: true,
    onChange: () => new CRPGMPanel().render(true),
  };
});

Hooks.once("diceSoNiceReady", async (dice3d) => {
  dice3d.addSystem({ id: "crp", name: "Corona Regni Poloniae" }, "preferred");

  dice3d.addColorset(
    {
      name: "crp",
      description: "Corona Regni Poloniae",
      category: "Colors",
      foreground: "#ffffff",
      background: "#000000",
      outline: "gray",
      texture: "none",
    },
    "preferred",
  );

  dice3d.addDicePreset(
    {
      type: "d10",
      labels: [
        "systems/crp/assets/orzel-kostka.webp",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "systems/crp/assets/tarcza_kostka.webp",
      ],
      system: "crp",
      labelScale: 0.5,
    },
    "d10",
  );
});
function refreshCharacterSheetLocks(locked) {
  for (const sheet of document.querySelectorAll(".crp-sheet")) {
    sheet
      .querySelectorAll(".crp-attr-value, .crp-skill-value, .crp-pd-value")
      .forEach((input) => {
        input.disabled = locked;
      });
  }

  for (const actor of game.actors) {
    if(actor.sheet?.rendered){
    actor.sheet?.render(true);
  }
}
}
