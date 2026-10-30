import { CRPRoll } from "../rolls/roll.mjs";
import { CRPAdvancementWindow } from "../app/advancment.mjs";
// module/actor/actor.mjs

const ARMOR_PENALIZED_SKILLS = new Set(["athletics", "stealth", "survival"]);
const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);

function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}

export class CRPActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();

    const system = this.system;
    const attr = system.attributes;
    const derived = system.derived;
    const isNPC = isNPCActor(this);

    // Inicjatywa
    derived.initiative = isNPC
      ? Number(system.npc?.attributes) || 0
      : attr.agility.value + attr.perception.value;

    derived.initiativeWeaponModifier = this.getInitiativeWeaponModifier();
    derived.initiativeArmorModifier = this.getInitiativeArmorModifier();
    derived.initiativeTotal =
      derived.initiative +
      derived.initiativeWeaponModifier +
      derived.initiativeArmorModifier;

    // Zdrowie
    const maxHealth = isNPC
      ? Math.max(1, Number(derived.health.max) || 8)
      : attr.strength.value + attr.character.value;

    if (!isNPC) {
      derived.health.max = maxHealth;
    }

    if (
      isNPC &&
      (!Number.isFinite(Number(derived.health.value)) ||
        derived.health.value < 1)
    ) {
      derived.health.value = maxHealth;
    }

    // clamp
    if (derived.health.value > maxHealth) {
      derived.health.value = maxHealth;
    }

    if (isNPC) {
      const equipment = system.equipment ?? {};
      const armorId = equipment.armor?.id;
      const armor = armorId ? this.items.get(armorId) : null;
      const shields = ["rightHand", "leftHand"]
        .map((slot) => {
          const id = equipment[slot]?.id;
          return id ? this.items.get(id) : null;
        })
        .filter((item) => item?.type === "shield");

      system.npc.protection = [
        armor?.type === "armor" ? armor : null,
        ...shields,
      ]
        .filter(Boolean)
        .reduce((sum, item) => sum + (Number(item.system.protection) || 0), 0);
    }

    // PUNKTY MANEWRU
    const combatSkills = [
      attr.strength.skills.twoHanded.value,
      attr.strength.skills.brawl.value,
      attr.agility.skills.oneHanded.value,
      attr.agility.skills.lightWeapons.value,
      attr.strength.skills.shield.value,
      attr.perception.skills.ranged.value,
    ];

    const bestCombatSkill = Math.max(...combatSkills);

    const maxManeuver = attr.perception.value + attr.reason.value;

    derived.maneuver.max = maxManeuver;

    if (derived.maneuver.value > maxManeuver || derived.maneuver.value === 0) {
      derived.maneuver.value = maxManeuver;
    }

    const hp = derived.health.value;
    const max = derived.health.max;

    let penalty = 0;

    // progi
    if (hp <= 0) {
      penalty = -2;
    } else if (hp < max / 2) {
      penalty = -1;
    }

    system.derived.woundPenalty = penalty;

    let woundState = "healthy";

    if (hp <= 0) {
      woundState = "critical";
    } else if (hp < max / 2) {
      woundState = "wounded";
    }

    system.derived.woundState = woundState;
  }

  async rollSkill(attrKey, skillKey) {
    return await CRPRoll.skill(this, attrKey, skillKey);
  }

  _mapSkillToAttribute(skillKey) {
    const map = {
      // STR
      twoHanded: "strength",
      brawl: "strength",
      endurance: "strength",
      shield: "strength",
      intimidate: "strength",

      // AGI
      oneHanded: "agility",
      lightWeapons: "agility",
      athletics: "agility",
      craft: "agility",
      stealth: "agility",

      // PER
      ranged: "perception",
    };

    return map[skillKey];
  }

  getWeaponInitiativeModifier(item) {
    if (!item || item.type !== "weapon") return 4;
    if (item.system.range === "ranged" || item.system.skill === "ranged")
      return -3;
    if (item.system.skill === "lightWeapons") return 2;
    if (item.system.skill === "twoHanded") return -2;
    return 0;
  }

  getInitiativeWeaponModifier() {
    const equipment = this.system.equipment ?? {};

    const modifiers = ["rightHand", "leftHand"].map((slot) => {
      const id = equipment[slot]?.id;
      const item = id ? this.items.get(id) : null;

      return this.getWeaponInitiativeModifier(item);
    });

    return Math.min(...modifiers);
  }

  getInitiativeArmorModifier() {
    const item = this.getEquippedArmor();

    return item?.type === "armor" ? -(item.system.protection ?? 0) : 0;
  }

  getEquippedArmor() {
    const equipment = this.system.equipment ?? {};
    const id = equipment.armor?.id;

    return id ? this.items.get(id) : null;
  }

  getArmorSkillPenalty(skillKey) {
    if (!ARMOR_PENALIZED_SKILLS.has(skillKey)) return 0;

    const armor = this.getEquippedArmor();
    if (armor?.type !== "armor") return 0;

    return Math.max(0, Number(armor.system.protection) || 0);
  }

  getEquippedWeapon(skillKey = null) {
    const equipment = this.system.equipment ?? {};
    const handWeapons = ["rightHand", "leftHand"]
      .map((slot) => {
        const id = equipment[slot]?.id;
        return id ? this.items.get(id) : null;
      })
      .filter((item) => item?.type === "weapon");

    const equippedWeapons = this.items.filter(
      (item) => item.type === "weapon" && item.system.equipped,
    );

    const candidates = [...handWeapons, ...equippedWeapons]
      .filter(
        (item, index, array) =>
          array.findIndex((i) => i.id === item.id) === index,
      )
      .filter((item) => !skillKey || item.system.skill === skillKey);

    return (
      candidates.sort(
        (a, b) => (b.system.damage ?? 0) - (a.system.damage ?? 0),
      )[0] ?? null
    );
  }

  async opposedTest(targetActor, attrA, skillA, attrB, skillB, options = {}) {
    return await CRPRoll.opposed(
      this,
      attrA,
      skillA,
      targetActor,
      attrB,
      skillB,
      options,
    );
  }

  async spendFate(amount = 1) {
    const current = this.system.resources.fate.value;

    if (current < amount) {
      ui.notifications.warn("Brak punktów Doli!");
      return false;
    }

    await this.update({
      "system.resources.fate.value": current - amount,
    });

    return true;
  }

  async applyWoundsState() {
    const hp = this.system.derived.health.value;

    const update = {};

    if (hp <= 0 && !this.system.state.bleeding) {
      update["system.state.bleeding"] = true;
    }

    if (hp > 0 && this.system.state.bleeding) {
      update["system.state.bleeding"] = false;
    }

    if (Object.keys(update).length) {
      await this.update(update);
    }
  }

  async clearWoundsState() {
    await this.update({
      "system.state.bleeding": false,
      "system.state.unconscious": false,
      "system.state.life": "alive",
    });
  }

  async applyDamage(amount) {
    if (amount <= 0) return;

    const hp = this.system.derived.health.value;
    const max = this.system.derived.health.max;

    const currentHp = Number(hp) || 0;
    const newHp = Math.max(-max, currentHp - amount);

    await this.update({
      "system.derived.health.value": newHp,
    });

    await this.applyWoundsState();
  }
  //rzeczy do zrobienia przed stworzeniem Aktora
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    const actor = this;
    if (!["character", ...CRP_NPC_ACTOR_TYPES].includes(actor.type)) return;
    const reasonValue = this?.system?.attributes?.reason?.value ?? 4;
    // TOKEN DEFAULT
    await this.updateSource({
      prototypeToken: {
        name: actor.name,
        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        bar1: {
          attribute: "derived.health",
          editable: false,
        },
        actorLink: actor.type === "character",
        disposition: actor.type === "character" ? 1 : -1,
      },
      system: {
        resources: {
          advantageUses: {
            value: reasonValue,
          },
        },
      },
    });
  }
  //rzeczy do zrobienia przy updacie Aktora
  async _onUpdate(data, options, user) {
    await super._onUpdate(data, options, user);
    const changeName = data?.name ?? false;
    const actor = this;
    const dependedTokens = actor.getDependentTokens();
    if (changeName && this.type === "character") {
      const tokenName = data.name;
      const dialog = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("CRP.ui.dialog.changeTokenName.title"),
        content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenName.content", { name: tokenName })}</p>`,
      });
      if (dialog) {
        await actor.prototypeToken.update({ name: tokenName });
        for (const token of dependedTokens) {
          await token.update({ name: tokenName });
        }
        this.sheet.render({ force: true });
      }
    }
    const tokenImg = data?.prototypeToken?.texture?.src ?? false;
    if (tokenImg && this.type === "character") {
      const tokenName = data.name;
      const dialog = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize("CRP.ui.dialog.changeTokenImage.title"),
        content: `<p>${game.i18n.format("CRP.ui.dialog.changeTokenImage.content", { name: tokenName })}</p>`,
      });
      if (dialog) {
        await actor.prototypeToken.update({ name: tokenName });
        for (const token of dependedTokens) {
          await token.update({ ["texture.src"]: tokenImg });
        }
        this.sheet.render({ force: true });
      }
    }
    if (this.sheet.rendered) {
      this.sheet.render();
    }
    const hasExperienceChange = [
      "system.resources.experience",
      "system.resources.experience.value",
      "system.resources.experience.free",
      "system.resources.experience.log",
    ].some((path) => hasChangedPath(data, path));
    const hasManeuverChange = [
      "system.derived.maneuver",
      "system.derived.maneuver.value",
      "system.derived.maneuver.max",
    ].some((path) => hasChangedPath(data, path));

    if (hasExperienceChange && hasManeuverChange) {
      if (hasExperienceChange) {
        CRPAdvancementWindow.refreshForActor(actor);
      }
    }
  }
  async atackRoll(itemId) {
    const item = this.items.get(itemId) ?? null;

    if (item && item.type !== "weapon") {
      ui.notifications.warn("Tarcza nie sluzy do ataku.");
      return;
    }

    const isUnarmedAttack = !item;
    const attackSkill = isUnarmedAttack ? "brawl" : item.system?.skill;
    const itemType = isUnarmedAttack ? "unarmed" : item.type;
    const itemRange = isUnarmedAttack ? "melee" : item.system?.range;
    const attackerMounted = !!this.system.equipment.mounted;
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
    const defenderMounted = equipment.mounted;

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

    const hasEmptyHand = !equipment.rightHand?.id || !equipment.leftHand?.id;

    const canParry = hasParryWeapon || (isUnarmedAttack && hasEmptyHand);

    const isShield = (item) => item?.type === "shield";

    const hasShield = isShield(rightItem) || isShield(leftItem);

    const mountedAdvantage = attackerMounted && !defenderMounted ? 2 : 0;
    const attackChoice = await getAttackModifier(this, {
      allowManeuvers: !isNPCActor(this),
    }).catch(() => null);

    if (!attackChoice?.confirmed) return;

    const selectedAttackModifier = attackChoice.modifier;
    const maneuverCost = Math.max(0, Number(attackChoice.maneuverCost) || 0);
    const currentManeuver = this.system.derived.maneuver?.value ?? 0;

    if (maneuverCost > currentManeuver) {
      ui.notifications.warn("Brak wystarczającej liczby Punktów Manewru.");
      return;
    }

    if (maneuverCost > 0) {
      await this.update({
        "system.derived.maneuver.value": currentManeuver - maneuverCost,
      });
    }

    const combat = game.combat;
    const combatant = combat?.combatants.find(
      (combatant) => combatant.actor?.id === this.id,
    );
    const aimedAttack = this.getFlag("crp", "aimedAttack");
    const aimedAttackBonus =
      combat?.started &&
      aimedAttack?.combatId === combat.id &&
      aimedAttack?.combatantId === combatant?.id
        ? Number(aimedAttack.bonus) || 3
        : 0;
    const startsAimedAttack =
      attackChoice.maneuver === "aimedAttack" && combat?.started && combatant;
    const oneTimeAimedAttack =
      attackChoice.maneuver === "aimedAttack" && !combat?.started;
    const startsDefensiveAttack =
      attackChoice.maneuver === "defensiveAttack" &&
      combat?.started &&
      combatant;
    const oneTimeDefensiveAttack =
      attackChoice.maneuver === "defensiveAttack" && !combat?.started;

    if (startsAimedAttack) {
      await this.setFlag("crp", "aimedAttack", {
        combatId: combat.id,
        combatantId: combatant.id,
        expiresRound: (combat.round ?? 0) + 1,
        bonus: 3,
      });
    }

    if (startsDefensiveAttack) {
      await this.setFlag("crp", "defensiveAttack", {
        combatId: combat.id,
        combatantId: combatant.id,
        expiresRound: (combat.round ?? 0) + 1,
        bonus: 3,
      });
    }

    if (oneTimeDefensiveAttack) {
      await this.setFlag("crp", "defensiveAttack", {
        oneTime: true,
        bonus: 3,
      });
    }

    const totalAttackModifier =
      attackModifier +
      mountedAdvantage +
      selectedAttackModifier +
      (startsAimedAttack || oneTimeAimedAttack ? 3 : aimedAttackBonus);
    const attr = this._mapSkillToAttribute(attackSkill);
    const allowFate = this.system.resources.fate.value > 0;

    const atackRoll = await CRPRoll.skill(this, attr, attackSkill, {
      chat: false,
      allowFate: allowFate,
      modifier: totalAttackModifier,
      displayModifier: selectedAttackModifier,
    });
    const penalty = this.system.derived.woundPenalty ?? 0;

    Object.assign(atackRoll, {
      name: this.name,
      skill: CONFIG.CRP.skills[attackSkill],
      attr: CONFIG.CRP.attributes[attr],
      displayModifier: selectedAttackModifier,
      rany: penalty > 0,
      karaRany: penalty,
      pancerz: atackRoll.armorPenalty > 0,
      allowFate: allowFate,
      reRoll: false,
      testData: {
        attAttr: attr,
        attSkill: attackSkill,
        uuid: this.uuid,
        chat: false,
        allowFate: allowFate,
        modifier: totalAttackModifier,
        displayModifier: selectedAttackModifier,
      },
    });
    const msg = await ChatMessage.create({
      content: "",
      system: {
        crp: {
          defenseChoice: {
            attacker: this.uuid,
            defender: targetActor.uuid,
            attackSkill,
            itemType,
            itemRange,
            totalAttackModifier,
            selectedAttackModifier,
            attackerMounted,
            defenderMounted,
            canParry,
            isRangedAttack,
            hasShield,
            defenceChoice: true,
          },
          atackRoll: atackRoll,
        },
      },
    });
    await msg.regenerateAtakRollContent();
    await msg.update({
      content: msg.content.replace(
        'data-message-id=""',
        `data-message-id="${msg.id}"`,
      ),
    });
  }
}

function hasChangedPath(changed, path) {
  return (
    foundry.utils.hasProperty(changed, path) || Object.hasOwn(changed, path)
  );
}

async function getAttackModifier(actor, { allowManeuvers = true } = {}) {
  const strikeText = (text) =>
    [...text].map((character) => `${character}\u0336`).join("");
  const activeAimedAttack = actor.getFlag("crp", "aimedAttack");
  const activeDefensiveAttack = actor.getFlag("crp", "defensiveAttack");
  const hasActiveManeuver = !!activeAimedAttack || !!activeDefensiveAttack;
  const availableManeuver = actor.system.derived.maneuver?.value ?? 0;
  const maneuvers = [
    { key: "none", cost: 0, implemented: true },
    { key: "assault", cost: 0, implemented: false },
    { key: "holdBack", cost: 0, implemented: false },
    { key: "charge", cost: 0, implemented: false },
    { key: "shieldGuard", cost: 0, implemented: false },
    { key: "harry", cost: 1, implemented: false },
    { key: "withdraw", cost: 1, implemented: false },
    { key: "knockdown", cost: 1, implemented: false },
    { key: "standUp", cost: 1, implemented: false },
    { key: "defensiveAttack", cost: 2, implemented: true },
    { key: "aimedAttack", cost: 2, implemented: true },
    { key: "lightningAttack", cost: 2, implemented: false },
    { key: "shieldBash", cost: 2, implemented: false },
    { key: "extraDodge", cost: 4, implemented: false },
    { key: "disarm", cost: 4, implemented: false },
  ]
    .map((maneuver) => ({
      ...maneuver,
      name: game.i18n.localize(`CRP.Maneuvers.${maneuver.key}.name`),
      description: game.i18n.localize(
        `CRP.Maneuvers.${maneuver.key}.description`,
      ),
    }))
    .sort((a, b) => {
      if (a.key === "none") return -1;
      if (b.key === "none") return 1;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.name.localeCompare(b.name, game.i18n.lang);
    })
    .map((maneuver) => ({
      ...maneuver,
      displayName: maneuver.implemented
        ? maneuver.name
        : strikeText(maneuver.name),
      disabled:
        maneuver.key !== "none" &&
        (hasActiveManeuver || maneuver.cost > availableManeuver),
    }));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/attack.hbs",
    {
      maneuver: actor.system.derived.maneuver,
      maneuvers,
      allowManeuvers,
    },
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Atak" },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Atakuj",
        default: true,
        callback: (_event, _button, dialog) => {
          const value = Number(
            dialog.element.querySelector("input[name='attackModifier']")
              ?.value ?? 0,
          );
          const maneuverSelect = dialog.element.querySelector(
            "select[name='maneuver']",
          );
          const maneuverOption = maneuverSelect?.selectedOptions[0];
          const maneuverCost = Number(maneuverOption?.dataset.cost ?? 0);
          const maneuverDisabled = maneuverOption?.disabled;

          return {
            confirmed: true,
            modifier: Math.max(
              -4,
              Math.min(4, Number.isFinite(value) ? value : 0),
            ),
            maneuver:
              allowManeuvers && !maneuverDisabled
                ? (maneuverSelect?.value ?? "none")
                : "none",
            maneuverCost:
              allowManeuvers &&
              !maneuverDisabled &&
              Number.isFinite(maneuverCost)
                ? maneuverCost
                : 0,
          };
        },
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false }),
      },
    ],
    render: (_event, dialog) => {
      const input = dialog.element.querySelector(
        "input[name='attackModifier']",
      );
      const output = dialog.element.querySelector(".crp-attack-modifier-value");
      if (!input || !output) return;

      const refreshOutput = () => {
        const value = Number(input.value) || 0;
        output.value = value >= 0 ? `+${value}` : String(value);
      };

      input.addEventListener("input", refreshOutput);
      refreshOutput();

      const maneuverSelect = dialog.element.querySelector(
        "select[name='maneuver']",
      );
      const maneuverDescription = dialog.element.querySelector(
        ".crp-attack-maneuver-description",
      );

      if (maneuverSelect && maneuverDescription) {
        const refreshManeuverDescription = () => {
          const option = maneuverSelect.selectedOptions[0];
          maneuverDescription.textContent = option?.dataset.description ?? "";
        };

        maneuverSelect.addEventListener("change", refreshManeuverDescription);
        refreshManeuverDescription();
      }
    },
  });
}
