    const html = this.element;
    html.querySelectorAll(".crp-roll-npc-attributes").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();

        const choice = await getSkillModifier().catch(() => null);

        if (!choice?.confirmed) return;

        CRPRoll.skill(this.document, "strength", "endurance", {
          modifier: choice.modifier,
          displayModifier: choice.modifier,
          targetOverride: this.document.system.npc?.attributes,
          rollLabel: "Rzut na Atrybut postaci",
        });
      });
    });

    // ======================
    //  ROLL WILLPOWER
    // ======================
    html.querySelectorAll(".crp-roll-willpower").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();

        CRPRoll.willpower(this.document);
      });
    });

    html
      .querySelector(".crp-npc-sheet-lock")
      ?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const locked = !!this.document.getFlag("crp", "npcSheetLocked");
        await this.document.setFlag("crp", "npcSheetLocked", !locked);
        this.render(false);
      });

    html.querySelectorAll(".crp-item-row").forEach((el) => {
      el.addEventListener("dragstart", (ev) => {
        const itemId = el.dataset.itemId;
        const item = this.document.items.get(itemId);
        if (!item) return;

        ev.dataTransfer.setData(
          "text/plain",
          JSON.stringify({
            type: "Item",
            uuid: item.uuid,
          }),
        );
      });

      // ======================
      // CLICK → OTWÓRZ ITEM
      // ======================
      el.addEventListener("click", (ev) => {
        // ❗ NIE otwieraj przy kliknięciu delete
        if (ev.target.closest(".crp-item-delete")) return;

        const itemId = el.dataset.itemId;
        if (!itemId) return;

        const item = this.document.items.get(itemId);
        if (!item) return;

        item.sheet.render(true);
      });
    });

    html.querySelectorAll(".crp-eq-slot").forEach((el) => {
      el.addEventListener("click", async (ev) => {
        // ❗ ignoruj klik w delete
        if (ev.target.closest(".crp-slot-clear")) return;

        // ❗ znajdź slot po DOM (nie po el)
        let slotEl = ev.target;
        while (slotEl && !slotEl.classList?.contains("crp-eq-slot")) {
          slotEl = slotEl.parentElement;
        }

        if (!slotEl) return;

        const slot = slotEl.dataset.slot;

        // tylko ręce
        if (slot !== "rightHand" && slot !== "leftHand") return;

        const eq = this.document.system.equipment[slot];
        const itemId = typeof eq === "string" ? eq : eq?.id;
        const item = itemId ? this.document.items.get(itemId) : null;

        if (item && item.type !== "weapon") {
          ui.notifications.warn("Tarcza nie sluzy do ataku.");
          return;
        }

        const isUnarmedAttack = !item;
        const attackSkill = isUnarmedAttack ? "brawl" : item.system?.skill;
        const itemType = isUnarmedAttack ? "unarmed" : item.type;
        const itemRange = isUnarmedAttack ? "melee" : item.system?.range;
        const attackerMounted = !!this.document.system.equipment.mounted;
        const getSlotAttackModifier = () => {
          if (isUnarmedAttack) return -3;
          if (item.type !== "weapon") return 0;
          if (itemRange === "ranged" || attackSkill === "ranged") return 2;
          if (attackSkill === "lightWeapons") return -1;
          if (attackSkill === "twoHanded") return 3;
          return 1;
        };
        const attackModifier = getSlotAttackModifier();

        // target
        const targets = Array.from(game.user.targets);
        if (!targets.length) {
          ui.notifications.warn("Brak celu");
          return;
        }

        const targetActor = targets[0].actor;
        if (!targetActor) return;

        const equipment = targetActor.system.equipment;
        const defenderMounted = !!equipment.mounted;

        const isValidParryWeapon = (item) => {
          if (!item) return false;

          if (item.type !== "weapon") return false;

          // KLUCZOWE
          if (item.system.range === "ranged") return false;

          return true;
        };

        const rightItem = equipment.rightHand?.id
          ? targetActor.items.get(equipment.rightHand.id)
          : null;

        const leftItem = equipment.leftHand?.id
          ? targetActor.items.get(equipment.leftHand.id)
          : null;

        const isRangedAttack = itemRange === "ranged";

        const hasParryWeapon =
          isValidParryWeapon(rightItem) || isValidParryWeapon(leftItem);

        const hasEmptyHand =
          !equipment.rightHand?.id || !equipment.leftHand?.id;

        const canParry = hasParryWeapon || (isUnarmedAttack && hasEmptyHand);

        const isShield = (item) => item?.type === "shield";

        const hasShield = isShield(rightItem) || isShield(leftItem);

        const mountedAdvantage = attackerMounted && !defenderMounted ? 2 : 0;
        const attackChoice = await getAttackModifier(this.document, {
          allowManeuvers: !isNPCActor(this.document),
        }).catch(() => null);

        if (!attackChoice?.confirmed) return;

        const selectedAttackModifier = attackChoice.modifier;
        const maneuverCost = Math.max(
          0,
          Number(attackChoice.maneuverCost) || 0,
        );
        const currentManeuver =
          this.document.system.derived.maneuver?.value ?? 0;

        if (maneuverCost > currentManeuver) {
          ui.notifications.warn("Brak wystarczającej liczby Punktów Manewru.");
          return;
        }

        if (maneuverCost > 0) {
          await this.document.update({
            "system.derived.maneuver.value": currentManeuver - maneuverCost,
          });
        }

        const combat = game.combat;
        const combatant = combat?.combatants.find(
          (combatant) => combatant.actor?.id === this.document.id,
        );
        const aimedAttack = this.document.getFlag("crp", "aimedAttack");
        const aimedAttackBonus =
          combat?.started &&
          aimedAttack?.combatId === combat.id &&
          aimedAttack?.combatantId === combatant?.id
            ? Number(aimedAttack.bonus) || 3
            : 0;
        const startsAimedAttack =
          attackChoice.maneuver === "aimedAttack" &&
          combat?.started &&
          combatant;
        const oneTimeAimedAttack =
          attackChoice.maneuver === "aimedAttack" && !combat?.started;
        const startsDefensiveAttack =
          attackChoice.maneuver === "defensiveAttack" &&
          combat?.started &&
          combatant;
        const oneTimeDefensiveAttack =
          attackChoice.maneuver === "defensiveAttack" && !combat?.started;

        if (startsAimedAttack) {
          await this.document.setFlag("crp", "aimedAttack", {
            combatId: combat.id,
            combatantId: combatant.id,
            expiresRound: (combat.round ?? 0) + 1,
            bonus: 3,
          });
        }

        if (startsDefensiveAttack) {
          await this.document.setFlag("crp", "defensiveAttack", {
            combatId: combat.id,
            combatantId: combatant.id,
            expiresRound: (combat.round ?? 0) + 1,
            bonus: 3,
          });
        }

        if (oneTimeDefensiveAttack) {
          await this.document.setFlag("crp", "defensiveAttack", {
            oneTime: true,
            bonus: 3,
          });
        }

        const totalAttackModifier =
          attackModifier +
          mountedAdvantage +
          selectedAttackModifier +
          (startsAimedAttack || oneTimeAimedAttack ? 3 : aimedAttackBonus);

        const msg = await ChatMessage.create({
          content: `
  <div class="crp-defense-choice"
    data-message-id=""
    data-attacker="${this.document.uuid}"
    data-defender="${targetActor.uuid}"
    data-skill="${attackSkill}"
data-item-type="${itemType}"
data-range="${itemRange}"
data-attack-modifier="${totalAttackModifier}"
data-selected-attack-modifier="${selectedAttackModifier}"
data-attacker-mounted="${attackerMounted ? "true" : "false"}"
data-defender-mounted="${defenderMounted ? "true" : "false"}">

    <p>Wybierz obronę:</p>

<button 
  data-defense="parry"
  ${!canParry ? "disabled" : ""}
  data-blocked-by-range="${isRangedAttack ? "true" : "false"}">
  Parowanie
</button>

<button data-defense="dodge">Unik${defenderMounted ? " (-2)" : ""}</button>

<button data-defense="shield" ${!hasShield ? "disabled" : ""}>
  Tarcza
</button>
  </div>
`,
        });

        await msg.update({
          content: msg.content.replace(
            'data-message-id=""',
            `data-message-id="${msg.id}"`,
          ),
        });
      });
    });