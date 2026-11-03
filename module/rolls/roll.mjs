// module/rolls/roll.mjs

const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);

function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}

export class CRPRoll {
  static resolveCritical(dice, total) {
    const isDouble = dice.length === 2 && dice[0] === dice[1];

    if (isDouble && total === 2) return "criticalSuccess";
    if (isDouble && total === 20) return "criticalFailure";

    return "none";
  }

static resolveOutcome(dice, total, target) {
  const critical = this.resolveCritical(dice, total);

  const success =
    critical === "criticalSuccess" ||
    (critical !== "criticalFailure" && total <= target);

  const resultsText = {
    criticalSuccess: "Krytyczny sukces!",
    criticalFailure: "Krytyczna porażka!",
    success: "Test zakończony sukcesem.",
    failure: "Test zakończony porażką.",
  }[critical !== "none" ? critical : success ? "success" : "failure"];

  return { critical, success, resultsText };
}

  static async skill({
      actor,
      modyfiers = {},
      reRoll = false,
      allowFate = false,
      rollLabel = "",
      chat = true}
  ) {

    const target = Math.max(2, modyfiers.target );

    // rzut 2k10
    const roll = await new Roll("2d10").roll();
    const dice = roll.dice?.[0]?.results?.map((r) => r.result) ?? [];
    const total = roll.total;

    // poziom sukcesu
    const margin = target - total;

    // sukces / porażka

    const { critical, success, resultsText } = this.resolveOutcome(dice, total, target);

    // symbole
    const eagles = dice.filter((d) => d === 1).length;
    const shields = dice.filter((d) => d === 10).length;
    const showSymbols = eagles > 0 || shields > 0

    // wynik
    const result = {
      actor,
      dice,
      total,
      target,
      margin,
      success,
      critical,
      eagles,
      shields,
      modyfiers,
      allowFate,
      reRoll,
      rollLabel,
      showSymbols,
      resultsText,
      usedFate: false
    };

    if (chat) {
     const chat=  await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: "",
        system: {
          crp: result,
        },
      });
      chat.regenerateSkillRoll()
    }

    return result;
  } 

static async fortitude(actor, { chat = true, modifier = 0 } = {}) {
  const result = await this.skill(actor, "strength", "endurance", {
    chat: false,
    allowFate: false,
    modifier: modifier
  });

  if (chat && result) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: this.renderFortitudeHTML(actor, result)
    });
  }

  return result;
}




  // actor.mjs

  async rollAttack(skillKey) {
    const weapon = this.getEquippedWeapon();

    const attrKey = this._mapSkillToAttribute(skillKey);

    const result = await this.rollSkill(attrKey, skillKey);

    if (!result.success) return result;

    let damage = weapon?.system.damage ?? 1;

    // opcjonalnie margin jako bonus
    damage += Math.max(0, result.margin);

    return {
      ...result,
      damage,
    };
  }

  static async initiative(actor, { chat = true, combatant = null } = {}) {
    const base =
      actor.system.derived.initiativeTotal ??
      actor.system.derived.initiative ??
      0;

    const roll = await new Roll("1d6").roll();
    const dice = roll.dice?.[0]?.results?.map((r) => r.result) ?? [];
    const total = roll.total;

    const final = base + total;

    const result = {
      base,
      dice,
      total,
      final,
    };

    // ======================
    // COMBAT INTEGRATION
    // ======================

    const combat = game.combat;

    if (combat) {
      if (combatant) {
        await combatant.setFlag("crp", "initiativeRoll", total);
        await combatant.setFlag("crp", "initiativeBase", base);
        await combat.setInitiative(combatant.id, final);
      } else {
        const fallback = combat.combatants.find(
          (c) => c.actor?.id === actor.id,
        );

        if (fallback) {
          await fallback.setFlag("crp", "initiativeRoll", total);
          await fallback.setFlag("crp", "initiativeBase", base);
          await combat.setInitiative(fallback.id, final);
        } else {
          ui.notifications.warn("Aktor nie jest w walce");
        }
      }
    }

    // ======================
    // CHAT
    // ======================

    if (chat) {
      const content = `
      <div class="crp-roll-card">
        <div class="crp-roll-header">
          <img src="${actor.img}" class="crp-roll-avatar">
          <div>
            <div class="crp-roll-actor">${actor.name}</div>
            <div class="crp-roll-skill">Inicjatywa</div>
          </div>
        </div>

        <div class="crp-roll-body">
          <div>⚡ Inicjatywa: <b>${base}</b></div>
          <div>🎲 K6: <b>${dice.join(", ")}</b></div>
          <div>👉 Wynik: <b>${final}</b></div>
        </div>
      </div>
    `;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
      });
    }

    return result;
  }
}
