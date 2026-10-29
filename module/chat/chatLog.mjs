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
  const container = target.closest(".crp-defense-choice");
  const {
    messageId,
    attacker: attackerUuid,
    defender: defenderUuid,
    skill,
    itemType,
    range,
    attackerMounted,
    defenderMounted,
  } = container.dataset;

  const defenseType = target.dataset.defense;
  const attackModifier = Number(container.dataset.attackModifier) || 0;
  const selectedAttackModifier = Number(container.dataset.selectedAttackModifier) || 0;
  const attackerIsMounted = attackerMounted === "true";
  const defenderIsMounted = defenderMounted === "true";

  const [attacker, defender] = await Promise.all([
    fromUuid(attackerUuid),
    fromUuid(defenderUuid),
  ]);

  if (!attacker || !defender) return;

  if (!game.user.isGM && !defender.isOwner) {
    ui.notifications.warn("Nie kontrolujesz tej postaci");
    return;
  }

  const mountedDefenseModifier = defenderIsMounted && !attackerIsMounted ? 2 : 0;
  let defenseModifier = mountedDefenseModifier;
  let defSkill;

  const equipment = defender.system.equipment;
  const handItems = ["rightHand", "leftHand"].map((slot) => {
    const id = equipment[slot]?.id;
    return id ? defender.items.get(id) : null;
  });

  const getCombatModifier = ({ item, skill, unarmed = false } = {}) => {
    if (unarmed) return -3;
    if (item?.type !== "weapon") return 0;
    if (item.system.range === "ranged" || skill === "ranged") return 2;
    if (skill === "lightWeapons") return -1;
    if (skill === "twoHanded") return 3;
    return 1;
  };

  const getTotal = (skill) => {
    if (!skill) return -999;

    const attr = defender._mapSkillToAttribute(skill);
    if (!attr) return -999;

    const attributes = defender.system.attributes[attr];
    return (attributes?.value ?? 0) + (attributes?.skills?.[skill]?.value ?? 0);
  };

  if (defenseType === "parry") {
    if (itemType === "weapon" && range === "ranged") {
      ui.notifications.warn("Nie można parować ataku dystansowego");
      return;
    }

    const candidates = handItems
      .filter((item) => item?.type === "weapon" && item.system.range !== "ranged")
      .map((item) => ({
        skill: item.system.skill,
        modifier: getCombatModifier({ item, skill: item.system.skill }),
      }));

    if (itemType === "unarmed" && handItems.some((item) => !item)) {
      candidates.push({
        skill: "brawl",
        modifier: getCombatModifier({ unarmed: true }),
      });
    }

    const best = candidates.sort(
      (a, b) => getTotal(b.skill) + b.modifier - getTotal(a.skill) - a.modifier,
    )[0];

    if (!best) {
      ui.notifications.warn(
        itemType === "unarmed"
          ? "Brak wolnej ręki lub broni do parowania"
          : "Brak broni do parowania",
      );
      return;
    }

    defSkill = best.skill;
    defenseModifier += best.modifier;
  } else if (defenseType === "dodge") {
    defSkill = "athletics";
    defenseModifier = defenderIsMounted ? -2 : mountedDefenseModifier;
  } else if (defenseType === "shield") {
    if (!handItems.some((item) => item?.type === "shield")) {
      ui.notifications.warn("Brak tarczy");
      return;
    }

    defSkill = "shield";
    defenseModifier += 1;
  }

  const combat = game.combat;
  const combatant = combat?.combatants.find((c) => c.actor?.id === defender.id);
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
        displayModifier: defenseType === "dodge" && defenderIsMounted ? -2 : null,
      },
    },
  );

  if (result?.winner !== "A") return;

  const marginA = result.rollA?.margin ?? 0;
  const marginB = result.rollB?.margin ?? 0;
  const baseDamage = Math.max(0, marginA - marginB);

  const attackEagles = result.rollA?.eagles ?? 0;
  const attackShields = result.rollA?.shields ?? 0;
  const hasAttackModifiers = attackEagles !== 0 || attackShields !== 0;

  let damage = Math.max(0, baseDamage + attackEagles - attackShields);

  const armorProtection = defender.items.get(equipment.armor?.id)?.system?.protection ?? 0;

  const shieldProtection =
    defenseType === "shield"
      ? Math.max(
          ...handItems.map((item) =>
            item?.type === "shield" ? Number(item.system?.protection) || 0 : 0,
          ),
        )
      : 0;

  const defenseEagles = result.rollB?.eagles ?? 0;
  const defenseShields = result.rollB?.shields ?? 0;

  const reduction = Math.max(
    0,
    armorProtection + shieldProtection + defenseEagles - defenseShields,
  );

  damage = Math.max(0, damage - reduction);

  const defenderFate = defender.system.resources.fate.value ?? 0;
  const needsDamageChoice = damage > 0 && defenderFate > 0;
  const autoDamage = damage > 0 && defenderFate < 1;

  if (autoDamage) await defender.applyDamage(damage);

  if (!result.messageId) return;

  const msg = game.messages.get(result.messageId);
  if (!msg) return;

  const fate = defenderFate !== 0
    ? {
        use: true,
        actorUuid: defender.uuid,
        skill: defSkill,
        attr: getTotal(defSkill) - (defender.system.attributes[defender._mapSkillToAttribute(defSkill)]?.skills?.[defSkill]?.value ?? 0),
        modifier: defenseModifier,
      }
    : { use: false };

  const defenseResult = {
    label: {
      parry: "Parowanie",
      dodge: "Unik",
      shield: "Tarcza",
    }[defenseType] ?? defenseType,
  };

  const damageResult = {
    base: baseDamage,
    reduction,
    defenseEagles,
    defenseShields,
    hasAttackModifiers,
    total: damage,
  };

  const damageControls = {
    disabled: false,
    damageControls: damage || (
      !needsDamageChoice
        ? "Brak Doli - obrażenia przyjęte automatycznie."
        : "Obrońca może przyjąć albo anulować obrażenia wydając punkt Doli."
    ),
    damage,
    defenderUuid: defender.uuid,
    messageId,
  };

  const newContent = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/chat/oposite-test.hbs",
    { content: msg.content, fate, defenseResult, damageResult, damageControls },
  );

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

function renderDamageControls({
  messageId,
  defenderUuid,
  damage,
  hasFate,
  resolved = false,
  status = "",
} = {}) {

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