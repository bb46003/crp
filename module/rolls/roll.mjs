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

    return null;
  }

  static resolveOutcome(dice, total, target) {
    const critical = this.resolveCritical(dice, total);

    const success =
      critical === "criticalSuccess" ||
      (critical !== "criticalFailure" && total <= target);

    return { critical, success };
  }

  static formatMargin(margin) {
    return margin >= 0 ? `+${margin}` : margin;
  }

  static async showDiceSoNice(roll) {
    const diceSoNiceActive = game.modules.get("dice-so-nice")?.active;
    const showForRoll = game.dice3d?.showForRoll;

    if (!diceSoNiceActive || typeof showForRoll !== "function") return;

    try {
      await showForRoll.call(game.dice3d, roll, game.user, true);
    } catch (error) {
      console.warn(
        "CRP | Nie udało się wyświetlić rzutu w Dice So Nice.",
        error,
      );
    }
  }

  static async skill(
    actor,
    attrKey,
    skillKey,
    {
      chat = true,
      allowFate = true,
      modifier = 0,
      displayModifier = null,
      targetOverride = null,
      rollLabel = null,
      reRoll = false,
    } = {},
  ) {
    if (!actor) {
      console.error("Brak aktora");
      return null;
    }

    const attr = actor.system.attributes[attrKey];

    if (!attr) {
      console.error("Brak atrybutu:", attrKey);
      return null;
    }

    const skill = attr.skills[skillKey];

    if (!skill) {
      console.error("Brak skilla:", skillKey);
      return null;
    }

    const isNPC = isNPCActor(actor);
    const effectiveAllowFate = allowFate && !isNPC;
    const penalty = actor.system.derived.woundPenalty ?? 0;
    const armorPenalty = actor.getArmorSkillPenalty?.(skillKey) ?? 0;

    const hasTargetOverride =
      targetOverride !== null &&
      targetOverride !== undefined &&
      Number.isFinite(Number(targetOverride));

    const targetBase = hasTargetOverride
      ? Number(targetOverride)
      : isNPC
        ? Number(actor.system.npc?.attributes ?? 8)
        : attr.value + skill.value;

    const target = Math.max(2, targetBase + penalty + modifier - armorPenalty);

    // rzut 2k10
    const roll = await new Roll("2d10").roll();
    await this.showDiceSoNice(roll);
    const dice = roll.dice?.[0]?.results?.map((r) => r.result) ?? [];
    const total = roll.total;

    // poziom sukcesu
    const margin = target - total;

    // sukces / porażka

    const { critical, success } = this.resolveOutcome(dice, total, target);

    // symbole
    const eagles = dice.filter((d) => d === 1).length;
    const shields = dice.filter((d) => d === 10).length;

    // wynik
    const result = {
      dice,
      total,
      target,
      margin,
      success,
      critical,
      eagles,
      shields,
      armorPenalty,
      displayModifier,
    };
    const content = await this.renderRollHTML(actor, attrKey, skillKey, result, {
      usedFate: false,
      allowFate: effectiveAllowFate,
      rollLabel,
      reRoll,
    });
    Object.assign(content.context, { modifier: modifier });
    Object.assign(result, { content: content });
    if (chat) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: content.html,
        system:{
          crp: content.context
        }
      });
    }

    return result;
  }



static async renderRollHTML(
  actor,
  attrKey,
  skillKey,
  result,
  { usedFate = false, allowFate = true, rollLabel = null, reRoll = false } = {},
) {
  const canUseFate = allowFate && (actor.isOwner || game.user.isGM);

  const skillLabel = CONFIG.CRP.skills[skillKey] ?? skillKey;
  const attrLabel = CONFIG.CRP.attributes[attrKey] ?? attrKey;

  const woundPenalty = actor.system.derived.woundPenalty ?? 0;

  const armorPenalty =
    result.armorPenalty ?? actor.getArmorSkillPenalty?.(skillKey) ?? 0;

  let resultText;

  if (result.critical === "criticalSuccess") {
    resultText = "🔥 KRYTYCZNY SUKCES";
  } else if (result.critical === "criticalFailure") {
    resultText = "💀 KRYTYCZNA PORAŻKA";
  } else {
    resultText = result.success ? "✔ SUKCES" : "❌ PORAŻKA";
  }

  const context = {
    actor,
    attrKey,
    skillKey,

    rollLabel: rollLabel ?? `${skillLabel} (${attrLabel})`,

    usedFate,
    canUseFate,

    success: result.success,
    critical: result.critical,

    diceDisplay: result.dice.length ? result.dice.join(", ") : "—",
    total: result.total,
    target: result.target,

    displayModifier: result.displayModifier ?? 0,
    modifierText:
      result.displayModifier === null
        ? ""
        : ` (modyfikator: ${result.displayModifier >= 0 ? "+" : ""}${result.displayModifier})`,

    woundPenalty,
    armorPenalty,

    showWoundPenalty: woundPenalty !== 0,
    showArmorPenalty: armorPenalty > 0,

    resultText,

    showMargin: !result.critical,
    marginText: this.formatMargin(result.margin),

    eagles: result.eagles,
    shields: result.shields,

    showEagles: result.eagles > 0,
    showShields: result.shields > 0,
    showSymbols: result.eagles > 0 || result.shields > 0,
    reRoll: reRoll,
  };

  const html = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/chat/skill-roll.hbs",
    context,
  );

  return {html, context};
}

  static async processTurn(actor) {
    // blokada wielokrotnego wywołania w tej samej turze
    if (actor.getFlag("crp", "processedTurn")) return;
    await actor.setFlag("crp", "processedTurn", true);

    if (actor.system.state.life === "dead") return;
    if (!actor.system.state.bleeding) return;

    // rzut (BEZ chata)
    const result = await this.fortitude(actor, { chat: false });
    if (!result) return;

    // =====================
    // LOGIKA STANÓW (NA AKTUALNYM STANIE)
    // =====================

    if (!actor.system.state.unconscious) {
      // był przytomny → może stracić przytomność
      if (!result.success) {
        await actor.update({
          "system.state.unconscious": true,
        });

        ui.notifications.warn(`${actor.name} traci przytomność!`);
      }
    } else {
      // był nieprzytomny → może umrzeć
      if (!result.success) {
        await actor.update({
          "system.state.life": "dead",
          "system.state.bleeding": false,
          "system.state.unconscious": false,
        });

        ui.notifications.error(`${actor.name} umiera!`);
      }
    }

    // odśwież UI (opcjonalne, ale OK)
    await actor.sheet?.render(false);

    // render do chata (już po update → stan jest aktualny)
    const content = this.renderFortitudeHTML(actor, result);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
    });
  }

  /* TEST TĘŻYZNY!

static async fortitude(actor, { chat = true } = {}) {
  const result = await this.skill(actor, "strength", "endurance", {
    chat: false,
    allowFate: false
  });

  if (chat && result) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: this.renderFortitudeHTML(actor, result)
    });
  }

  return result;
}
  */

  static renderFortitudeHTML(actor, result) {
    const penalty = actor.system.derived.woundPenalty ?? 0;

    const resultText =
      result.critical === "criticalSuccess"
        ? "🔥 CUD! PRZETRWAŁ"
        : result.critical === "criticalFailure"
          ? "💀 NATYCHMIASTOWA ŚMIERĆ"
          : result.success
            ? "PRZETRWAŁ"
            : "UMIERA";

    const marginText = result.critical
      ? null
      : this.formatMargin(result.margin);

    return `
    <div class="crp-roll">
      <h3>💀 Test tężyzny</h3>

      <p><strong>Kostki:</strong> ${result.dice?.length ? result.dice.join(", ") : "—"}</p>
      <p><strong>Wynik:</strong> ${result.total}</p>
      <p><strong>Cel:</strong> ${result.target}</p>

      ${penalty !== 0 ? `<p>⚠ Kara za rany: ${penalty}</p>` : ""}

      <p><strong>${resultText}</strong></p>
      ${marginText !== null ? `<p><strong>Margin:</strong> ${marginText}</p>` : ""}

      <p>Stan: ${
        actor.system.state.life === "dead"
          ? "💀 martwy"
          : actor.system.state.unconscious
            ? "😵 nieprzytomny"
            : actor.system.state.bleeding
              ? "🩸 krwawi"
              : "✔ stabilny"
      }</p>
    </div>
  `;
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
