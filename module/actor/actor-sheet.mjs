import { CRPRoll } from "../rolls/roll.mjs";
import { formatMoney, normalizeMoney, obolsToMoney } from "../currency.mjs";
import { CRPAdvancementWindow } from "../app/advancment.mjs";

const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);
const { api, sheets } = foundry.applications;

export class CRPActorSheet extends api.HandlebarsApplicationMixin(
  sheets.ActorSheetV2,
) {
  constructor(...args) {
    super(...args);

    /** @type {CharacterActor} */
    this.actor;
  }
  static DEFAULT_OPTIONS = {
    classes: ["crp-sheet", "sheet", "actor"],
    window: {
      title: "CRP Actor",
      resizable: true,
    },
    position: {
      width: 945,
      height: 860,
    },
    dragDrop: [
      { 
        dragSelector: ".crp-item-list .crp-item-row, .crp-equipment .crp-item-row", 
        dropSelector: null // null oznacza, że drop można wykonać na dowolne miejsce karty
      }
    ],
    actions: {
      clearMoney: CRPActorSheet.#clearMoney,
      deleteItem: CRPActorSheet.#deleteItem,
      addAdvantageUses: CRPActorSheet.#addAdvantageUses,
      useAdvantageUses: CRPActorSheet.#useAdvantageUses,
      assigneLanguageType: CRPActorSheet.#assigneLanguageType,
      rollSkill: CRPActorSheet.#rollSkill,
      rollInitiative: CRPActorSheet.#rollInitiative,
      advancement: CRPActorSheet.#advancement,
      crestSelect: CRPActorSheet.#crestSelect,
      openItem: CRPActorSheet.#openItem
    },
    form: {
      submitOnChange: true,
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/character-sheet.hbs",
    },
    bio: {
      id: "tabs",
      template: "systems/crp/templates/actor/tabs/character-tab-bio.hbs",
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
  static TABS = {
    items: {
      tabs: [
        { id: "bio", group: "items", label: "" },
        { id: "equipment", group: "items", label: "" },
        { id: "attributes", group: "items", label: "" },
      ],
      initial: "attributes",
    },
  };

  //  JEDYNE źródło danych dla template
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    Object.assign(context, {
      actor: this.actor,
      system: system,
      attributesList: this._prepareAttributesList(),
      healthPercent: this._prepareHealthPercent(),
      initiative: this._prepareInitiative(),
      characterSheetsLocked: game.settings.get("crp", "characterSheetsLocked"),
      formattedMoney: formatMoney(obolsToMoney(system.money.total)),
      items: this.actor.items,
      woundPenalty: this._preparewoundPenalty(),
      traits: this._prepareTraits(),
      languages: this._prepareLanguages(),
      description: {
        value: this.actor.system.bio.description,
        enriched: await enrich(this.actor.system.bio.description),
        field: this.actor.system.schema.fields.bio.fields.description,
      },
    });

    return context;
  }
  _prepareAttributesList() {
    const attributesList = [];
    const config = CONFIG.CRP;
    for (const key of Object.keys(config.attributes)) {
      const attrData = this.actor.system.attributes?.[key];
      attributesList.push({
        key,
        label: String(config.attributes[key]), // 👈 ważne
        value: attrData?.value ?? 0,
        skills: Object.keys(attrData?.skills ?? {}).map((sk) => {
          const skillValue = attrData.skills[sk].value ?? 0;
          const attrValue = attrData?.value ?? 0;
          const armorPenalty = this.actor.getArmorSkillPenalty?.(sk) ?? 0;
          return {
            key: sk,
            label: String(config.skills[sk]),
            value: skillValue,
            total: Math.max(
              0,
              isNPCActor(this.actor)
                ? (Number(this.actor.system.npc?.attributes) || 0) -
                    armorPenalty
                : skillValue + attrValue - armorPenalty,
            ),
            armorPenalty,
          };
        }),
      });
    }
    return attributesList;
  }
  _prepareHealthPercent() {
    const system = this.actor.system;
    const hp = system.derived.health;
    return hp.max > 0 ? Math.floor((hp.value / hp.max) * 100) : 0;
  }
  _prepareInitiative() {
    const system = this.actor.system;
    const initiative = {
      weaponModifierText:
        system.derived.initiativeWeaponModifier >= 0
          ? `+${system.derived.initiativeWeaponModifier}`
          : `${system.derived.initiativeWeaponModifier}`,
      armorModifierText:
        system.derived.initiativeArmorModifier >= 0
          ? `+${system.derived.initiativeArmorModifier}`
          : `${system.derived.initiativeArmorModifier}`,
    };
    return initiative;
  }
  _preparewoundPenalty() {
    const system = this.actor.system;
    const hp = system.derived.health;
    let penalty = 0;
    if (hp.value <= 0) {
      penalty = -2;
    } else if (hp.value < hp.max / 2) {
      penalty = -1;
    }
    return penalty;
  }
  _prepareTraits() {
    const flaws = this.document.items.filter(
      (item) => item.type === "trait" && item.system.category === "flaw",
    );
    const advantages = this.document.items.filter(
      (item) => item.type === "trait" && item.system.category === "advantage",
    );
    return {
      flaws: flaws,
      advantages: advantages,
      advantagesRemaining: Math.max(0, 2 - advantages.length),
      flawsRemaining: Math.max(0, 1 - flaws.length),
      advantageUses: this.actor.system.resources.advantageUses?.value ?? 0,
    };
  }
  _prepareLanguages() {
    const nativeLanguage =
      this.actor.items.find(
        (item) => item.type === "language" && item.system.role === "native",
      ) ?? null;
    const foreignLanguages = this.actor.items.filter(
      (item) => item.type === "language" && item.system.role === "foreign",
    );
    const unassigned = this.actor.items.filter(
      (item) => item.type === "language" && item.system.role === "unassigned",
    );
    const foreignLanguageLimit = this._getForeignLanguageLimit();
    return {
      native: nativeLanguage,
      foreign: foreignLanguages,
      unassigned: unassigned,
      used: foreignLanguages.length,
      remaining: Math.max(0, foreignLanguageLimit - foreignLanguages.length),
      limit: foreignLanguageLimit,
      alphabets: {
        latin: "Łaciński",
        cyrillic: "Cyrylica",
        arabic: "Arabski",
        none: "Brak",
      },
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const dragTargets = this.element.querySelectorAll(".crp-item-row");
    dragTargets.forEach(el => {
      el.addEventListener("dragstart", this.#customDragStart.bind(this));
    });
  }


  #customDragStart(event) {
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId)
    if (!itemId) return;
    const dragData = {
      type: "Item",
      uuid: item.uuid,
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = "move";
  }

  async _onDrop(event) {

    const data = event.dataTransfer;
    const toElement = event.toElement;
    const parent = toElement.closest(".crp-eq-slot");
    const  itemData = data.getData('text/plain');
    if(itemData === ""){
      return
    }
    const droppedItem = JSON.parse(itemData);
    const itemDoc = await fromUuid(droppedItem.uuid);
    if (
      toElement.classList.value.includes("slot") ||
      parent?.classList?.value.includes("slot")
    ) {
      let updateData = {};

      const slotType = toElement?.dataset?.slot || parent?.dataset?.slot;
      if (
        itemDoc.type == slotType ||
        (slotType?.includes("Hand") && itemDoc.type === "weapon")
      ) {
        switch (slotType) {
          case "armor":
            updateData = {
              ["system.equipment.armor"]: {
                id: itemDoc.id,
                name: itemDoc.name,
                img: itemDoc.img,
              },
            };
            break;
          case "leftHand":
            updateData = {
              ["system.equipment.leftHand"]: {
                id: itemDoc.id,
                name: itemDoc.name,
                img: itemDoc.img,
              },
            };
            break;
          case "rightHand":
            updateData = {
              ["system.equipment.rightHand"]: {
                id: itemDoc.id,
                name: itemDoc.name,
                img: itemDoc.img,
              },
            };
            break;
        }
        await this.actor.update(updateData);
        this.render({ force: true });
      }
    }
    if (itemDoc.type === "language") {
      const nativeLanguage =
        this.actor.items.find(
          (item) => item.type === "language" && item.system.role === "native",
        ) ?? null;
      if (!nativeLanguage) {
        const content = await foundry.applications.handlebars.renderTemplate(
          "systems/crp/templates/dialogs/wybor-jezyka.hbs",
          {
            type: itemDoc.system.schema.fields.role,
            name: itemDoc.name,
          },
        );
        foundry.applications.api.DialogV2.wait({
          window: { title: "Wybór Typu Jezyka" },
          content: content,
          buttons: [
            {
              action: "confirm",
              label: "Wybierz",
              default: true,
              callback: async (_event, _button, dialog) => {
                const selector = dialog.element.querySelector("select");
                const role = selector.value;
                const jezyk = await this.actor.createEmbeddedDocuments("Item", [
                  itemDoc,
                ]);
                await jezyk[0].update({ [selector.name]: role });
              },
            },
          ],
        });
      } else {
        const jezyk = await this.actor.createEmbeddedDocuments("Item", [
          itemDoc,
        ]);
        await jezyk[0].update({ ["system.role"]: "foreign" });
      }
    } else {
      if (itemDoc.type === "origin") {
        const originItem = this.actor.items.find((i) => i.type === "origin");
        if (originItem) {
          ui.notifications.warn("Postać posiada już Pochodzenie.");
          return;
        }
      }
      super._onDrop(event);
    }
  }

  static async #clearMoney(ev) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "Opróżnić sakiewkę?",
      },

      content: `
      <p>
        Czy na pewno chcesz usunąć wszystkie monety tej postaci?
      </p>
    `,

      yes: {
        label: "Opróżnij",
        icon: "fa-solid fa-coins",
      },

      no: {
        label: "Anuluj",
        icon: "fa-solid fa-times",
      },
    });

    if (!confirmed) return;

    const emptyMoney = normalizeMoney({
      grzywna: 0,
      skojec: 0,
      grosz: 0,
      kwartnik: 0,
      cwiercgrosz: 0,
      denar: 0,
      obol: 0,
    });

    this._rememberScrollPosition();

    await this.actor.update({
      "system.money": emptyMoney,
    });
    this.render({ force: true });
  }
  static async #deleteItem(ev) {
    const btn = ev.target.closest(".crp-item-delete");
    if (!btn) return;
    if (
      btn.closest(".crp-bio") &&
      game.settings.get("crp", "characterSheetsLocked")
    ) {
      ui.notifications.warn("Karta postaci jest zablokowana.");
      return;
    }

    const itemId = btn.dataset.itemId;

    if (!itemId) return;

    const item = this.actor.items.get(itemId);

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "Usunąć przedmiot?",
      },
      content: `
      <p>
        Czy na pewno chcesz usunąć przedmiot
        <strong>${foundry.utils.escapeHTML(item?.name ?? "bez nazwy")}</strong>?
      </p>
    `,
      yes: {
        label: "Usuń",
        icon: "fa-solid fa-trash",
      },
      no: {
        label: "Anuluj",
        icon: "fa-solid fa-times",
      },
    });

    if (!confirmed) return;

    const eq = this.actor.system.equipment;
    const updates = {};
    const slots = ["rightHand", "leftHand", "armor"];

    for (const slot of slots) {
      if (eq[slot]?.id === itemId) {
        updates[`system.equipment.${slot}`] = {
          id: null,
          name: null,
          img: null,
        };
      }
    }

    if (this.actor.system.bio?.origin?.id === itemId) {
      updates["system.bio.origin"] = {
        id: null,
        name: null,
        img: null,
      };
    }
    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);

    if (Object.keys(updates).length) {
      await this.actor.update(updates);
    }
    this.render({ force: true });
  }
  static async #addAdvantageUses() {
    const current = this.actor.system.resources.advantageUses?.value ?? 0;
    await this.actor.update({
      "system.resources.advantageUses.value": current + 1,
    });
    this.render({ force: true });
  }
  static async #useAdvantageUses() {
    const current = this.actor.system.resources.advantageUses?.value ?? 0;
    if (current <= 0) {
      ui.notifications.warn("Brak dostępnych użyć Zalet.");
      return;
    }
    await this.actor.update({
      "system.resources.advantageUses.value": Math.max(0, current - 1),
    });
    this.render({ force: true });
  }
  static async #assigneLanguageType(ev) {
    const nativeLanguage =
      this.actor.items.find(
        (item) => item.type === "language" && item.system.role === "native",
      ) ?? null;
    const div = ev.target.closest(".crp-item-row.crp-language-row");
    const id = div.dataset.id;
    const itemDoc = await this.actor.items.get(id);
    if (!nativeLanguage) {
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/crp/templates/dialogs/wybor-jezyka.hbs",
        {
          type: itemDoc.system.schema.fields.role,
          name: itemDoc.name,
        },
      );
      foundry.applications.api.DialogV2.wait({
        window: { title: "Wybór Typu Jezyka" },
        content: content,
        buttons: [
          {
            action: "confirm",
            label: "Wybierz",
            default: true,
            callback: async (_event, _button, dialog) => {
              const selector = dialog.element.querySelector("select");
              const role = selector.value;
              await itemDoc.update({ [selector.name]: role });
            },
          },
        ],
      });
    } else {
      await itemDoc.update({ ["system.role"]: "foreign" });
    }
  }
  static async #rollSkill(ev) {
    const target = ev.target;
    if (target.tagName !== "INPUT") {
      const element = target.closest(".crp-skill");
      const attr = element.dataset.attr;
      const skill = element.dataset.skill;
      const choice = await getSkillModifier().catch(() => null);

      if (!choice?.confirmed) return;

      const targetOverride = isNPCActor(this.actor)
        ? this.actor.system.npc?.attributes
        : null;

      CRPRoll.skill(this.actor, attr, skill, {
        modifier: choice.modifier,
        displayModifier: choice.modifier,
        targetOverride,
      });
    }
  }

  static async #rollInitiative() {
    CRPRoll.initiative(this.actor);
  }
  static async #advancement() {
    new CRPAdvancementWindow(this.actor).render({ force: true });
  }
  static async #crestSelect() {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.document.system.bio?.crest || "",
      callback: async (path) => {
        await this.document.update({ "system.bio.crest": path });
        this.render({ force: true });
      },
    }).render(true);
  }
  static async #openItem(ev){
    const target = ev.target;
    const element = target.closest("[data-id]");
    const id = element.dataset.id;
    if(id){
      const item = this.actor.items.get(id);
      item.sheet.render({force:true})
    }
  }
  _getRootElement() {
    return this.element instanceof HTMLElement
      ? this.element
      : this.element?.[0];
  }

  _getForeignLanguageLimit() {
    const value = Number(
      this.actor.system.attributes?.reason?.skills?.languages?.value ?? 0,
    );
    if (value >= 10) return 4;
    if (value >= 9) return 3;
    if (value >= 6) return 2;
    if (value >= 3) return 1;
    return 0;
  }
}
function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
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

async function getSkillModifier() {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/skills.hbs",
  );

  return foundry.applications.api.DialogV2.wait({
    window: { title: "Test umiejętności" },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Rzuć",
        default: true,
        callback: (_event, _button, dialog) => {
          const value = Number(
            dialog.element.querySelector("input[name='skillModifier']")
              ?.value ?? 0,
          );
          return {
            confirmed: true,
            modifier: Math.max(
              -4,
              Math.min(4, Number.isFinite(value) ? value : 0),
            ),
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
      const input = dialog.element.querySelector("input[name='skillModifier']");
      const output = dialog.element.querySelector(".crp-skills-modifier-value");
      if (!input || !output) return;

      const refreshOutput = () => {
        const value = Number(input.value) || 0;
        output.value = value >= 0 ? `+${value}` : String(value);
      };

      input.addEventListener("input", refreshOutput);
      refreshOutput();
    },
  });
}
async function enrich(html) {
  if (html) {
    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      html,
      {
        secrets: game.user.isOwner,
        async: true,
      },
    );
  } else {
    return html;
  }
}
