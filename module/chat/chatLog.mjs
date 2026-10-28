export class CRPChatLog extends foundry.applications.sidebar.tabs.ChatLog {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: [...(super.DEFAULT_OPTIONS.classes ?? []), "crp-chat-log"],
    actions: {
      ...super.DEFAULT_OPTIONS.actions,
      useFate: CRPChatLog.#onUseFate,
      damageChoice: CRPChatLog.#onDamageChoice,
      defenseChoice: CRPChatLog.#onDefenseChoice,
    },
  };

  static async #onUseFate(event, target) {
    event.preventDefault();

    const button = target;
    if (button.classList.contains("used")) return;

    // Tutaj przenieś logikę użycia Doli.
  }

  static async #onDamageChoice(event, target) {
    event.preventDefault();

    const button = target;

    // Tutaj przenieś logikę rozliczania obrażeń.
  }

  static async #onDefenseChoice(event, target) {
    event.preventDefault();

    const button = target;
    
      const container = button.closest(".crp-defense-choice");
      const messageId = container.dataset.messageId;

      const attackerUuid = container.dataset.attacker;
      const defenderUuid = container.dataset.defender;
      const defenseType = button.dataset.defense;
      const skill = container.dataset.skill;
      const itemType = container.dataset.itemType;
      const range = container.dataset.range;
      const attackModifier = Number(container.dataset.attackModifier) || 0;
      const selectedAttackModifier =
        Number(container.dataset.selectedAttackModifier) || 0;
      const attackerMounted = container.dataset.attackerMounted === "true";
      const defenderMounted = container.dataset.defenderMounted === "true";

      const attacker = await fromUuid(attackerUuid);
      const defender = await fromUuid(defenderUuid);

      if (!attacker || !defender) return;

      //  uprawnienia
      const isGM = game.user.isGM;
      const ownsDefender = defender.isOwner;

      if (!isGM && !ownsDefender) {
        ui.notifications.warn("Nie kontrolujesz tej postaci");
        return;
      }

      let defSkill;
      const mountedDefenseModifier =
        defenderMounted && !attackerMounted ? 2 : 0;
      let defenseModifier = mountedDefenseModifier;

      const getCombatModifier = ({
        item = null,
        skill = null,
        unarmed = false,
      } = {}) => {
        if (unarmed) return -3;
        if (!item || item.type !== "weapon") return 0;
        if (item.system.range === "ranged" || skill === "ranged") return 2;
        if (skill === "lightWeapons") return -1;
        if (skill === "twoHanded") return 3;
        return 1;
      };

      if (defenseType === "parry") {
        // BLOKADA PAROWANIA VS RANGED
        if (itemType === "weapon" && range === "ranged") {
          ui.notifications.warn("Nie można parować ataku dystansowego");
          return;
        }

        const eq = defender.system.equipment;

        const getTotal = (skill) => {
          if (!skill) return -999;

          const attr = defender._mapSkillToAttribute(skill);
          if (!attr) return -999;

          const attrVal = defender.system.attributes[attr]?.value ?? 0;
          const skillVal =
            defender.system.attributes[attr]?.skills?.[skill]?.value ?? 0;

          return attrVal + skillVal;
        };

        const getParryCandidate = (slot) => {
          const id = eq[slot]?.id;
          if (!id) return null;

          const item = defender.items.get(id);
          if (!item) return null;

          // tylko broń
          if (item.type !== "weapon") return null;

          // broń dystansowa nie paruje
          if (item.system.range === "ranged") return null;

          return {
            skill: item.system.skill,
            modifier: getCombatModifier({ item, skill: item.system.skill }),
          };
        };

        const parryCandidates = [
          getParryCandidate("rightHand"),
          getParryCandidate("leftHand"),
        ].filter(Boolean);

        if (itemType === "unarmed") {
          const hasEmptyHand = !eq.rightHand?.id || !eq.leftHand?.id;

          if (hasEmptyHand) {
            parryCandidates.push({
              skill: "brawl",
              modifier: getCombatModifier({ unarmed: true }),
            });
          }

          const best = parryCandidates.sort(
            (a, b) =>
              getTotal(b.skill) + b.modifier - (getTotal(a.skill) + a.modifier),
          )[0];

          defSkill = best?.skill;
          defenseModifier = mountedDefenseModifier + (best?.modifier ?? 0);

          if (!defSkill) {
            ui.notifications.warn("Brak wolnej ręki lub broni do parowania");
            return;
          }
        } else {
          const best = parryCandidates.sort(
            (a, b) =>
              getTotal(b.skill) + b.modifier - (getTotal(a.skill) + a.modifier),
          )[0];

          if (!best) {
            ui.notifications.warn("Brak broni do parowania");
            return;
          }

          defSkill = best.skill;
          defenseModifier = mountedDefenseModifier + best.modifier;
        }
      }
      if (defenseType === "dodge") {
        defSkill = "athletics";
        defenseModifier = defenderMounted ? -2 : mountedDefenseModifier;
      }

      if (defenseType === "shield") {
        const eq = defender.system.equipment;

        const right = eq.rightHand?.id
          ? defender.items.get(eq.rightHand.id)
          : null;

        const left = eq.leftHand?.id
          ? defender.items.get(eq.leftHand.id)
          : null;

        const hasShield = right?.type === "shield" || left?.type === "shield";

        if (!hasShield) {
          ui.notifications.warn("Brak tarczy");
          return;
        }

        defSkill = "shield";
        defenseModifier = mountedDefenseModifier + 1;
      }

      const combat = game.combat;
      const combatant = combat?.combatants.find(
        (combatant) => combatant.actor?.id === defender.id,
      );
      const defensiveAttack = defender.getFlag("crp", "defensiveAttack");
      const defensiveAttackBonus = defensiveAttack?.oneTime
        ? Number(defensiveAttack.bonus) || 3
        : combat?.started &&
            defensiveAttack?.combatId === combat.id &&
            defensiveAttack?.combatantId === combatant?.id
          ? Number(defensiveAttack.bonus) || 3
          : 0;

      if (defensiveAttackBonus) {
        defenseModifier += defensiveAttackBonus;

        if (defensiveAttack.oneTime) {
          await defender.unsetFlag("crp", "defensiveAttack");
        }
      }

      const result = await attacker.opposedTest(
        defender,
        attacker._mapSkillToAttribute(skill),
        skill,
        defender._mapSkillToAttribute(defSkill),
        defSkill,
        {
          actorAOptions: {
            modifier: attackModifier,
            displayModifier: selectedAttackModifier,
          },
          actorBOptions: {
            modifier: defenseModifier,
            displayModifier:
              defenseType === "dodge" && defenderMounted ? -2 : null,
          },
        },
      );

      // =====================
      // OBRAŻENIA
      // =====================
      if (result?.winner === "A") {
        const marginA = result.rollA?.margin ?? 0;
        const marginB = result.rollB?.margin ?? 0;

        const baseDamage = Math.max(0, marginA - marginB);

        // =====================
        // SYMBOLE – ATAK
        // =====================
        const attackEagles = result.rollA?.eagles ?? 0;
        const attackShields = result.rollA?.shields ?? 0;

        let damage = baseDamage + attackEagles - attackShields;

        damage = Math.max(0, damage);

        // =====================
        // REDUKCJA OBRAŻEŃ
        // =====================
        const eq = defender.system.equipment;

        // --- ARMOR ---
        let armorProtection = 0;

        if (eq.armor?.id) {
          const armorItem = defender.items.get(eq.armor.id);
          armorProtection = armorItem?.system?.protection ?? 0;
        }

        // --- SHIELD ---
        let shieldProtection = 0;

        const rightShield = eq.rightHand?.id
          ? defender.items.get(eq.rightHand.id)
          : null;

        const leftShield = eq.leftHand?.id
          ? defender.items.get(eq.leftHand.id)
          : null;

        const getShieldProtection = (item) =>
          item?.type === "shield" ? Number(item.system?.protection) || 0 : 0;

        shieldProtection =
          defenseType === "shield"
            ? Math.max(
                getShieldProtection(rightShield),
                getShieldProtection(leftShield),
              )
            : 0;

        // =====================
        // SYMBOLE – OBRONA
        // =====================
        const defenseEagles = result.rollB?.eagles ?? 0;
        const defenseShields = result.rollB?.shields ?? 0;

        let reduction =
          armorProtection + shieldProtection + defenseEagles - defenseShields;

        reduction = Math.max(0, reduction);

        // najpierw odejmujemy
        damage = damage - reduction;

        // dopiero potem clamp
        damage = Math.max(0, damage);

        const reductionText = `
  🛡 Redukcja: ${reduction}
  (${armorProtection} pancerz
   ${shieldProtection ? ` + ${shieldProtection} tarcza` : ""}
   ${defenseEagles ? ` + ${defenseEagles} 🦅` : ""}
   ${defenseShields ? ` - ${defenseShields} 🛡️` : ""}
  )
`;

        let attackModText = "";

        if (attackEagles !== 0 || attackShields !== 0) {
          attackModText = `
    ⚔ Modyfikator ataku:
    ${attackEagles ? `+${attackEagles} 🦅 ` : ""}
    ${attackShields ? `-${attackShields} 🛡️` : ""}
  `;
        }

        // =====================
        // APPLY DAMAGE
        // =====================
        const defenderFate = defender.system.resources.fate.value ?? 0;
        const needsDamageChoice = damage > 0 && defenderFate > 0;
        const autoDamage = damage > 0 && defenderFate < 1;

        if (autoDamage) {
          await defender.applyDamage(damage);
        }

        // =====================
        // UPDATE WIADOMOŚCI PO ID
        // =====================
        if (result?.messageId) {
          const msg = game.messages.get(result.messageId);

          if (msg) {
            const damageControls =
              damage > 0
                ? renderDamageControls({
                    messageId: result.messageId,
                    defenderUuid: defender.uuid,
                    damage,
                    hasFate: needsDamageChoice,
                  })
                : "";

            const newContent =
              msg.content +
              `
  <div class="crp-damage">
    💥 Obrażenia bazowe: <b>${baseDamage}</b><br>
    ${reductionText}<br>
    ${attackModText ? attackModText + "<br>" : ""}
    👉 Obrażenia końcowe: <b>${damage}</b>
    ${damageControls}
  </div>
`;

            await msg.update({ content: newContent });

            if (autoDamage) {
              await msg.setFlag("crp", "damageResolved", {
                action: "auto",
                defenderUuid: defender.uuid,
                damage,
              });
            }
          }
        }
      }

      const defenseLabel =
        {
          parry: "Parowanie",
          dodge: "Unik",
          shield: "Tarcza",
        }[defenseType] ?? defenseType;

      // lokalna podmiana tylko u tego gracza
      for (const b of container.querySelectorAll("button")) {
        b.disabled = true;
      }
      container.innerHTML = `
  <div class="crp-defense-result">
    🛡 Wybrałeś: <b>${defenseLabel}</b>
  </div>
`;
    

    // Tutaj przenieś logikę wyboru obrony.
  }
}

function renderDamageControls({
  messageId,
  defenderUuid,
  damage,
  hasFate,
  resolved = false,
  status = "",
} = {}) {
  const disabled = resolved || !hasFate ? "disabled" : "";
  const note =
    status ||
    (!hasFate
      ? "Brak Doli - obrażenia przyjęte automatycznie."
      : "Obrońca może przyjąć albo anulować obrażenia wydając punkt Doli.");

  return `
<!-- CRP_DAMAGE_CONTROL_START -->
  <div class="crp-damage-control"
       data-message-id="${messageId}"
       data-defender="${defenderUuid}"
       data-damage="${damage}">
    <button type="button"
            class="crp-damage-choice"
            data-action="accept"
            data-message-id="${messageId}"
            data-defender="${defenderUuid}"
            data-damage="${damage}"
            ${disabled}>
      Przyjmij obrażenia
    </button>
    <button type="button"
            class="crp-damage-choice"
            data-action="cancel"
            data-message-id="${messageId}"
            data-defender="${defenderUuid}"
            data-damage="${damage}"
            ${disabled}>
      Anuluj obrażenia
    </button>
    <div class="crp-damage-status">${note}</div>
  </div>
<!-- CRP_DAMAGE_CONTROL_END -->
`;
}