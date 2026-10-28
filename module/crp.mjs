// module/crp.mjs

import { CRPActor } from "./actor/actor.mjs";
import {
  CRPActorData,
  CRPNPCKnechtData,
  CRPNPCRycerzData,
} from "./actor/actor-data.mjs";
import { CRP } from "./config.mjs";
import { CRPActorSheet } from "./actor/actor-sheet.mjs";
import { CRPNPCCommonerSheet } from "./actor/npc-commoner-sheet.mjs";
import { CRPNPCKnechtSheet } from "./actor/npc-knecht-sheet.mjs";
import { CRPNPCRycerzSheet } from "./actor/npc-rycerz-sheet.mjs";
import { CRPGMPanel } from "./gm-panel.mjs";
import { CRPItem } from "./item/item.mjs";
import {
  CRPWeaponData,
  CRPArmorData,
  CRPShieldData,
  CRPStuffData,
  CRPLanguageData,
  CRPOriginData,
  CRPTraitData,
} from "./item/item-data.mjs";
import {
  CRPWeaponSheet,
  CRPArmorSheet,
  CRPShieldSheet,
  CRPStuffSheet,
  CRPLanguageSheet,
  CRPOriginSheet,
  CRPTraitSheet,
} from "./item/item-sheet.mjs";
import { CRPCombat } from "./combat.mjs";
import { registerHandlebarsHelpers } from "./handlebars.mjs";
import { CRPToken } from "./tokens.mjs";


const CRP_PENDING_INITIATIVE_UPDATES = new Map();



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

  foundry.documents.collections.Actors.registerSheet(
    "crp",
    CRPNPCCommonerSheet,
    {
      types: ["npc"],
      makeDefault: true,
    },
  );

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


  registerHandlebarsHelpers();
   
});





// =====================
// SOCKET → GM UPDATE
// =====================
Hooks.once("ready", () => {
  game.socket.on("system.crp", async (data) => {
    if (!game.user.isGM) return;

    if (data.type === "damageChoiceSync") {
      const defender = await fromUuid(data.defenderUuid);
      const resolvedDamage = defender?.getFlag("crp", "resolvedDamage") ?? {};
      const resolved = resolvedDamage[data.messageId];

      if (resolved) {
        try {
          await updateDamageMessage({
            messageId: data.messageId,
            defenderUuid: data.defenderUuid,
            action: resolved.action,
            amount: resolved.damage,
            status: resolved.status,
          });
        } catch (err) {
          console.warn(
            "CRP | Nie udało się zsynchronizować wiadomości obrażeń",
            err,
          );
        }
      }

      return;
    }

    if (data.type === "damageChoice") {
      const defender = await fromUuid(data.defenderUuid);
      const user = game.users.get(data.userId);

      const respond = (ok, message = "") => {
        game.socket.emit("system.crp", {
          type: "damageChoiceResult",
          requestId: data.requestId,
          userId: data.userId,
          ok,
          message,
        });
      };

      if (!canUserResolveDamage(defender, user)) {
        respond(false, "Brak uprawnień do rozliczenia obrażeń tej postaci.");
        return;
      }

      try {
        const resolved = await resolvePendingDamage(data);
        respond(
          !!resolved,
          resolved
            ? ""
            : "Te obrażenia zostały już rozliczone albo wiadomość nie istnieje.",
        );
      } catch (err) {
        console.error("CRP | Błąd rozliczania obrażeń przez socket", err);
        respond(false, "Błąd rozliczania obrażeń po stronie MG.");
      }

      return;
    }

    if (data.type !== "defenseSelected") return;

    const msg = game.messages.get(data.messageId);
    if (!msg) return;

    const defenseLabel =
      {
        parry: "Parowanie",
        dodge: "Unik",
        shield: "Tarcza",
      }[data.defenseType] ?? data.defenseType;

    await msg.update({
      content: `
        <div class="crp-defense-result">
          🛡 Wybrana obrona: <b>${defenseLabel}</b>
        </div>
      `,
    });
  });
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

  for (const actor of game.actors?.contents ?? []) {
    actor.sheet?.render(false);
  }
}