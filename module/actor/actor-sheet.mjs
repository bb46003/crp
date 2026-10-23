import { CRPRoll } from "../rolls/roll.mjs";
import { formatMoney, normalizeMoney, obolsToMoney } from "../currency.mjs";

const { ApplicationV2, DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CRP_NPC_ACTOR_TYPES = new Set(["npc", "npc-knecht", "npc-rycerz"]);
const { api, sheets } = foundry.applications;
export class CRPAdvancementWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static openWindows = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["crp", "advancement"],
    window: {
      title: "Rozwój postaci",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    }
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/advancement.hbs"
    }
  };

  constructor(actor) {
    super({
      id: `crp-advancement-${actor.id}`
    });

    this.actor = actor;
    CRPAdvancementWindow.openWindows.set(actor.id, this);
  }

  static refreshForActor(actor) {
    const window = CRPAdvancementWindow.openWindows.get(actor.id);
    if (!window) return;

    window._rememberScrollPosition();
    window.render({ force: true });
  }

  async close(options = {}) {
    CRPAdvancementWindow.openWindows.delete(this.actor.id);
    return super.close(options);
  }

  _getScrollContainers() {
    const root = this.element;
    const containers = [
      root?.closest?.(".window-content"),
      root?.querySelector?.(".window-content"),
      root?.querySelector?.(".crp-adv-panel"),
      root
    ].filter(el => el && typeof el.scrollTop === "number");

    return [...new Set(containers)];
  }

  _rememberScrollPosition() {
    const containers = this._getScrollContainers();
    const scrolled = containers.find(el => el.scrollTop > 0);

    this._pendingScrollState = {
      main: scrolled?.scrollTop ?? containers[0]?.scrollTop ?? 0,
      log: this.element.querySelector(".crp-adv-log-entries")?.scrollTop ?? 0
    };
  }

  _restoreScrollPosition() {
    if (!this._pendingScrollState) return;

    const restore = () => {
      for (const container of this._getScrollContainers()) {
        container.scrollTop = this._pendingScrollState.main;
      }

      const log = this.element.querySelector(".crp-adv-log-entries");
      if (log) log.scrollTop = this._pendingScrollState.log;
    };

    restore();
    requestAnimationFrame(restore);
  }

  _prepareContext() {
    const system = this.actor.system;
    const config = CONFIG.CRP;
    const attributesList = [];
    const freeExperience = system.resources.experience.free ?? 0;
    const fateValue = system.resources.fate.value ?? 0;
    const fateMax = system.resources.fate.max ?? 2;
    const fateCost = (fateMax + 1) * 3;

    for (const key of Object.keys(config.attributes)) {
      const attrData = system.attributes?.[key];
      const attrValue = attrData?.value ?? 0;
      const attrCost = (attrValue + 1) * 4;

      attributesList.push({
        key,
        label: String(config.attributes[key]),
        value: attrValue,
        cost: attrCost,
        disabled: attrValue >= 10 || attrCost > freeExperience,
        skills: Object.keys(attrData?.skills ?? {}).map(sk => {
          const skillValue = attrData.skills[sk].value ?? 0;
          const skillCost = getSkillAdvancementCost(skillValue, attrValue);

          return {
            key: sk,
            label: String(config.skills[sk]),
            value: skillValue,
            total: skillValue + attrValue,
            cost: skillCost,
            disabled: skillValue >= 10 || skillCost > freeExperience
          };
        })
      });
    }

    return {
      actor: this.actor,
      system,
      config,
      experience: system.resources.experience,
      fate: {
        value: fateValue,
        max: fateMax,
        cost: fateCost,
        disabled: fateCost > freeExperience
      },
      advancementLog: [...(system.resources.experience.log ?? [])].reverse(),
      attributesList
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._restoreScrollPosition();

    this.element.querySelectorAll("[data-advancement-type]").forEach(button => {
      button.addEventListener("click", async () => {
        if (button.disabled) return;

        const type = button.dataset.advancementType;
        const attr = button.dataset.attr;
        const skill = button.dataset.skill;
        const freeExperience = this.actor.system.resources.experience.free ?? 0;
        const fateMax = this.actor.system.resources.fate.max ?? 2;
        const attrValue = this.actor.system.attributes?.[attr]?.value ?? 0;
        const skillValue = this.actor.system.attributes?.[attr]?.skills?.[skill]?.value ?? 0;
        const cost = type === "fate"
          ? (fateMax + 1) * 3
          : type === "attribute"
            ? (attrValue + 1) * 4
            : getSkillAdvancementCost(skillValue, attrValue);

        if (freeExperience < cost) return;
        if (type === "attribute" && attrValue >= 10) return;
        if (type === "skill" && skillValue >= 10) return;

        button.disabled = true;

        const path = type === "fate"
          ? "system.resources.fate.max"
          : type === "attribute"
            ? `system.attributes.${attr}.value`
            : `system.attributes.${attr}.skills.${skill}.value`;
        const nextValue = type === "fate"
          ? fateMax + 1
          : type === "attribute" ? attrValue + 1 : skillValue + 1;
        const label = type === "fate"
          ? "Dolę"
          : type === "attribute"
            ? String(CONFIG.CRP.attributes[attr])
            : String(CONFIG.CRP.skills[skill]);
        const log = [...(this.actor.system.resources.experience.log ?? []), {
          date: new Date().toLocaleString("pl-PL"),
          text: `Zwiększono ${label} do ${nextValue} (koszt: ${cost} PD).`
        }];

        this._rememberScrollPosition();

        try {
          const updates = {
            [path]: nextValue,
            "system.resources.experience.free": freeExperience - cost,
            "system.resources.experience.log": log
          };

          if (type === "attribute" && attr === "reason") {
            const advantageUses = this.actor.system.resources.advantageUses?.value ?? 0;
            updates["system.resources.advantageUses.value"] = advantageUses + 1;
          }

          await this.actor.update(updates);
        } finally {
          this.render({ force: true });
        }
      });
    });
  }
}

export class CRPActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2,) {

   constructor(...args) {
    super(...args);

    /** @type {CharacterActor} */
    this.actor;
  }

  get isEditable() {
  return true;
}

  static DEFAULT_OPTIONS = {
      ...super.DEFAULT_OPTIONS,
    editable: true,

    classes: ["crp-sheet", "sheet", "actor"],
    tag: "section",
    editable: true,
    window: {
      title: "CRP Actor",
      resizable: true
    },
    position: {
      width: 945,
      height: 860
    },

    dragDrop: [{ dropSelector: ".crp-sheet" }]

  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/actor/character-sheet.hbs"
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
  

  _getRootElement() {
    return this.element instanceof HTMLElement
      ? this.element
      : this.element?.[0];
  }

  _getScrollContainers(root = this._getRootElement()) {
    const containers = [
      root?.closest?.(".window-content"),
      root?.querySelector(".window-content"),
      root?.querySelector(".crp-sheet"),
      root
    ].filter(el => el && typeof el.scrollTop === "number");

    return [...new Set(containers)];
  }

  _getScrollTop() {
    const containers = this._getScrollContainers();
    const scrolled = containers.find(el => el.scrollTop > 0);

    return scrolled?.scrollTop ?? containers[0]?.scrollTop ?? 0;
  }

  _rememberScrollPosition() {
    this._pendingScrollTop = this._getScrollTop();
  }

  _restoreScrollPosition(scrollTop = this._pendingScrollTop) {
    if (scrollTop === undefined) return;

    const restore = () => {
      for (const container of this._getScrollContainers()) {
        container.scrollTop = scrollTop;
      }
    };

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 0);
  }

  async _openBioEditor() {
    const current = this.document.system.bio?.description ?? "";
    const value = foundry.utils.escapeHTML(current);

    const content = `
      <div class="crp-bio-dialog">
        <prose-mirror
          name="bio"
          value="${value}">
        </prose-mirror>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: `Biografia: ${this.document.name}`,
        icon: "fa-solid fa-feather"
      },
      position: {
        width: 760
      },
      content,
      buttons: [
        {
          action: "save",
          label: "Zapisz",
          icon: "fa-solid fa-save",
          default: true,
          callback: (_event, _button, dialog) =>
            dialog.element.querySelector("prose-mirror[name='bio']")?.value ?? ""
        },
        {
          action: "cancel",
          label: "Anuluj",
          icon: "fa-solid fa-times",
          callback: () => null
        }
      ],
      render: (_event, dialog) => {
        dialog.element.querySelector("prose-mirror[name='bio']")?.focus();
      }
    });

    if (result === null) return;

    await this.document.update({
      "system.bio.description": result
    });

    this.render(false);
  }

  _getForeignLanguageLimit() {
    const value = Number(
      this.document.system.attributes?.reason?.skills?.languages?.value ?? 0
    );

    if (value >= 10) return 4;
    if (value >= 9) return 3;
    if (value >= 6) return 2;
    if (value >= 3) return 1;
    return 0;
  }

  async _assignLanguage(item, role) {
    if (item.type !== "language") {
      ui.notifications.warn("W tym miejscu można umieszczać tylko przedmioty typu Język.");
      return;
    }

    const sourceActor = item.parent?.documentName === "Actor" ? item.parent : null;
    const belongsToActor = sourceActor?.id === this.document.id;
    const duplicate = this.document.items.find(candidate =>
      candidate.type === "language" &&
      candidate.id !== item.id &&
      candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase() &&
      String(candidate.system.alphabet).trim().toLocaleLowerCase() ===
        String(item.system.alphabet).trim().toLocaleLowerCase()
    );

    if (duplicate) {
      ui.notifications.warn("Postać zna już ten język.");
      return;
    }

    const foreignLanguages = this.document.items.filter(candidate =>
      candidate.type === "language" &&
      candidate.system.role === "foreign" &&
      candidate.id !== item.id
    );

    if (role === "foreign" && foreignLanguages.length >= this._getForeignLanguageLimit()) {
      ui.notifications.warn("Postać nie może znać więcej języków obcych.");
      return;
    }

    if (sourceActor && !belongsToActor && !sourceActor.isOwner && !game.user.isGM) {
      ui.notifications.warn("Brak uprawnień do przeniesienia języka z aktora źródłowego.");
      return;
    }

    const previousNative = role === "native"
      ? this.document.items.find(candidate =>
          candidate.type === "language" &&
          candidate.system.role === "native" &&
          candidate.id !== item.id
        )
      : null;

    let assigned = item;

    if (belongsToActor) {
      if (item.system.role !== role) {
        this._rememberScrollPosition();
        await item.update({ "system.role": role });
      }
    } else {
      const itemData = item.toObject();
      delete itemData._id;
      foundry.utils.setProperty(itemData, "system.role", role);

      this._rememberScrollPosition();
      [assigned] = await this.document.createEmbeddedDocuments("Item", [itemData]);
    }

    if (previousNative) {
      this._rememberScrollPosition();
      await this.document.deleteEmbeddedDocuments("Item", [previousNative.id]);
    }

    if (sourceActor && !belongsToActor) {
      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
      sourceActor.sheet?.render(false);
    }

    assigned?.sheet?.rendered && assigned.sheet.render(false);
  }

  async _assignOriginLanguage(origin) {
    const hasNativeLanguage = this.document.items.some(item =>
      item.type === "language" && item.system.role === "native"
    );
    const languageUuid = origin.system.language;

    if (hasNativeLanguage || !languageUuid || languageUuid === "none") return;

    const sourceLanguage = await fromUuid(languageUuid);
    if (!sourceLanguage || sourceLanguage.type !== "language") {
      ui.notifications.warn("Nie udało się odnaleźć języka przypisanego do Pochodzenia.");
      return;
    }

    const normalizedName = sourceLanguage.name.trim().toLocaleLowerCase();
    const normalizedAlphabet = String(sourceLanguage.system.alphabet)
      .trim()
      .toLocaleLowerCase();
    const existingLanguage = this.document.items.find(item =>
      item.type === "language" &&
      (
        item.uuid === sourceLanguage.uuid ||
        (
          item.name.trim().toLocaleLowerCase() === normalizedName &&
          String(item.system.alphabet).trim().toLocaleLowerCase() === normalizedAlphabet
        )
      )
    );

    if (existingLanguage) {
      if (existingLanguage.system.role !== "native") {
        this._rememberScrollPosition();
        await existingLanguage.update({ "system.role": "native" });
      }
      return;
    }

    const languageData = sourceLanguage.toObject();
    delete languageData._id;
    foundry.utils.setProperty(languageData, "system.role", "native");

    this._rememberScrollPosition();
    await this.document.createEmbeddedDocuments("Item", [languageData]);
  }

  async _assignOrigin(item) {
    if (item.type !== "origin") {
      ui.notifications.warn("W tym miejscu można umieścić tylko przedmiot typu Pochodzenie.");
      return;
    }

    const sourceActor = item.parent?.documentName === "Actor" ? item.parent : null;
    const belongsToActor = sourceActor?.id === this.document.id;

    if (sourceActor && !belongsToActor && !sourceActor.isOwner && !game.user.isGM) {
      ui.notifications.warn("Brak uprawnień do przeniesienia Pochodzenia z aktora źródłowego.");
      return;
    }

    let assigned = item;

    if (!belongsToActor) {
      const itemData = item.toObject();
      delete itemData._id;

      this._rememberScrollPosition();
      [assigned] = await this.document.createEmbeddedDocuments("Item", [itemData]);
    }

    const previousOriginId = this.document.system.bio?.origin?.id;

    this._rememberScrollPosition();
    await this.document.update({
      "system.bio.origin": {
        id: assigned.id,
        name: assigned.name,
        img: assigned.img
      }
    });

    await this._assignOriginLanguage(assigned);

    if (previousOriginId && previousOriginId !== assigned.id) {
      const previousOrigin = this.document.items.get(previousOriginId);
      if (previousOrigin?.type === "origin") {
        this._rememberScrollPosition();
        await this.document.deleteEmbeddedDocuments("Item", [previousOriginId]);
      }
    }

    if (sourceActor && !belongsToActor) {
      if (sourceActor.system.bio?.origin?.id === item.id) {
        await sourceActor.update({
          "system.bio.origin": {
            id: null,
            name: null,
            img: null
          }
        });
      }

      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
      sourceActor.sheet?.render(false);
    }
  }

  async _assignTrait(item, category) {
    if (item.type !== "trait") {
      ui.notifications.warn("W tym miejscu można umieszczać tylko przedmioty typu Wada/Zaleta.");
      return;
    }

    if (item.system.category !== category) {
      const expected = category === "advantage" ? "Zaletę" : "Wadę";
      ui.notifications.warn(`W tym slocie można umieścić tylko ${expected}.`);
      return;
    }

    const limits = {
      advantage: 2,
      flaw: 1
    };
    const assignedTraits = this.document.items.filter(candidate =>
      candidate.type === "trait" &&
      candidate.system.category === category &&
      candidate.id !== item.id
    );

    if (assignedTraits.length >= limits[category]) {
      ui.notifications.warn(
        category === "advantage"
          ? "Postać może posiadać maksymalnie dwie Zalety."
          : "Postać może posiadać maksymalnie jedną Wadę."
      );
      return;
    }

    const duplicate = assignedTraits.some(candidate =>
      candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()
    );

    if (duplicate) {
      ui.notifications.warn("Ten przedmiot jest już przypisany do postaci.");
      return;
    }

    const sourceActor = item.parent?.documentName === "Actor" ? item.parent : null;
    const belongsToActor = sourceActor?.id === this.document.id;

    if (belongsToActor) return;

    if (sourceActor && !sourceActor.isOwner && !game.user.isGM) {
      ui.notifications.warn("Brak uprawnień do przeniesienia przedmiotu z aktora źródłowego.");
      return;
    }

    const itemData = item.toObject();
    delete itemData._id;

    this._rememberScrollPosition();
    await this.document.createEmbeddedDocuments("Item", [itemData]);

    if (sourceActor) {
      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
      sourceActor.sheet?.render(false);
    }
  }

  //  JEDYNE źródło danych dla template
async _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    const system = this.document.system;
    const config = CONFIG.CRP;

    const tokenImg =
  this.document.prototypeToken?.texture?.src ||
  this.document.img;

    const attributesList = [];

    for (const key of Object.keys(config.attributes)) {
      const attrData = system.attributes?.[key];

      attributesList.push({
        key,
        label: String(config.attributes[key]), // 👈 ważne
        value: attrData?.value ?? 0,
        skills: Object.keys(attrData?.skills ?? {}).map(sk => {
  const skillValue = attrData.skills[sk].value ?? 0;
  const attrValue = attrData?.value ?? 0;
  const armorPenalty = this.document.getArmorSkillPenalty?.(sk) ?? 0;

  
  return {
    key: sk,
    label: String(config.skills[sk]),
    value: skillValue,
    total: Math.max(
      0,
      isNPCActor(this.document)
        ? (Number(system.npc?.attributes) || 0) - armorPenalty
        : skillValue + attrValue - armorPenalty
    ),
    armorPenalty
  };
})
      });
    }

    const hp = system.derived.health;

hp.percent = hp.max > 0
  ? Math.floor((hp.value / hp.max) * 100)
  : 0;

const nativeLanguage = this.document.items.find(item =>
  item.type === "language" && item.system.role === "native"
) ?? null;
const foreignLanguages = this.document.items.filter(item =>
  item.type === "language" && item.system.role === "foreign"
);
const foreignLanguageLimit = this._getForeignLanguageLimit();
const advantages = this.document.items.filter(item =>
  item.type === "trait" && item.system.category === "advantage"
);
const flaws = this.document.items.filter(item =>
  item.type === "trait" && item.system.category === "flaw"
);
const equippedArmor = system.equipment.armor?.id
  ? this.document.items.get(system.equipment.armor.id)
  : null;
const equippedShields = ["rightHand", "leftHand"]
  .map(slot => {
    const id = system.equipment[slot]?.id;
    return id ? this.document.items.get(id) : null;
  })
  .filter(item => item?.type === "shield");
const protection = {
  armor: equippedArmor?.type === "armor"
    ? Number(equippedArmor.system.protection) || 0
    : 0,
  shield: equippedShields.reduce(
    (sum, item) => sum + (Number(item.system.protection) || 0),
    0
  )
};

return {
  ...context,
  system,
  config,
  attributesList,
  formattedMoney: formatMoney(
    obolsToMoney(system.money.total)
  ),
  initiative: {
    weaponModifierText: system.derived.initiativeWeaponModifier >= 0
      ? `+${system.derived.initiativeWeaponModifier}`
      : `${system.derived.initiativeWeaponModifier}`,
    armorModifierText: system.derived.initiativeArmorModifier >= 0
      ? `+${system.derived.initiativeArmorModifier}`
      : `${system.derived.initiativeArmorModifier}`
  },
  protection,
  npcSheetLocked: !!this.document.getFlag("crp", "npcSheetLocked"),
  tokenImg,
  characterSheetsLocked: game.settings.get("crp", "characterSheetsLocked"),
  languages: {
    native: nativeLanguage,
    foreign: foreignLanguages,
    used: foreignLanguages.length,
    remaining: Math.max(0, foreignLanguageLimit - foreignLanguages.length),
    limit: foreignLanguageLimit,
    alphabets: {
      latin: "Łaciński",
      cyrillic: "Cyrylica",
      arabic: "Arabski",
      none: "Brak"
    }
  },
  traits: {
    advantages,
    flaws,
    advantagesRemaining: Math.max(0, 2 - advantages.length),
    flawsRemaining: Math.max(0, 1 - flaws.length),
    advantageUses: system.resources.advantageUses?.value ?? 0
  }
};

  }
 async _prepareContext(options){
    const context = await super._prepareContext(options);
    return context;
 }
_onRender(context, options) {
  const scrollTop = this._pendingScrollTop ?? this._getScrollTop();
  const group = "items";
  const tab = "bio"
    const tabElement = this.element.querySelector(`.tab [data-group="${group}"][data-tab="${tab}"]`);
  console.log("tabElement", tabElement);
  super._onRender(context, options);

const html = this._getRootElement();

if (!html) {
  console.error("CRP: HTML root NOT FOUND");
  return;
}

this._restoreScrollPosition(scrollTop);
this._pendingScrollTop = undefined;

  // ======================
  //  ROLL
  // ======================
  html.querySelectorAll(".crp-skill").forEach(el => {
    el.addEventListener("click", async ev => {

      if (ev.target.closest("input")) return;

      const attr = el.dataset.attr;
      const skill = el.dataset.skill;
      const choice = await getSkillModifier().catch(() => null);

      if (!choice?.confirmed) return;

      const targetOverride = isNPCActor(this.document)
        ? this.document.system.npc?.attributes
        : null;

      CRPRoll.skill(this.document, attr, skill, {
        modifier: choice.modifier,
        displayModifier: choice.modifier,
        targetOverride
      });
    });
  });

html.querySelectorAll(".crp-roll-npc-attributes").forEach(btn => {
  btn.addEventListener("click", async ev => {
    ev.stopPropagation();

    const choice = await getSkillModifier().catch(() => null);

    if (!choice?.confirmed) return;

    CRPRoll.skill(this.document, "strength", "endurance", {
      modifier: choice.modifier,
      displayModifier: choice.modifier,
      targetOverride: this.document.system.npc?.attributes,
      rollLabel: "Rzut na Atrybut postaci"
    });
  });
});

  // ======================
//  ROLL WILLPOWER
// ======================
html.querySelectorAll(".crp-roll-willpower").forEach(btn => {
  btn.addEventListener("click", ev => {

    ev.stopPropagation();

    CRPRoll.willpower(this.document);

  });
});

// ======================
//  ROLL INITIATIVE
// ======================
html.querySelectorAll(".crp-roll-initiative").forEach(btn => {
  btn.addEventListener("click", ev => {

    ev.stopPropagation();

    if (
      btn.classList.contains("crp-roll-npc-attributes") ||
      btn.classList.contains("crp-npc-sheet-lock")
    ) return;

    CRPRoll.initiative(this.document);

  });
});

html.querySelector(".crp-npc-sheet-lock")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  const locked = !!this.document.getFlag("crp", "npcSheetLocked");
  await this.document.setFlag("crp", "npcSheetLocked", !locked);
  this.render(false);
});

  // ======================
  //  INPUTY
  // ======================
html.querySelectorAll("input[data-path], textarea[data-path]").forEach(input => {

  input.addEventListener("change", async ev => {

    const path = ev.currentTarget.dataset.path;

    const isCheckbox =
      ev.currentTarget.type === "checkbox";
    const isText =
      ev.currentTarget.tagName === "TEXTAREA" ||
      ev.currentTarget.type === "text";

    let value = isCheckbox
      ? ev.currentTarget.checked
      : isText
        ? ev.currentTarget.value
        : Number(ev.currentTarget.value);

    if (!isCheckbox && !isText && isNaN(value)) {
      value = 0;
    }

    if (isCheckbox) {

      // checkbox bez ograniczeń

    } else if (isText) {

      // tekst bez ograniczeń liczbowych

    } else if (path.startsWith("system.attributes")) {

      value = Math.max(0, Math.min(10, value));

    } else {

      value = Math.max(0, value);

    }

    // ======================
    // MONEY NORMALIZATION
    // ======================

    if (path.startsWith("system.money")) {
      const key = path.replace("system.money.", "");
      const money = foundry.utils.deepClone(this.document.system.money);
      money[key] = value;
      const normalized = normalizeMoney(money);

      this._rememberScrollPosition();
      await this.document.update({
        "system.money": normalized
      });

      return;
    }

    // ======================
    // NORMAL INPUT UPDATE
    // ======================

    this._rememberScrollPosition();
    await this.document.update({
      [path]: value
    });

    if (path === "system.equipment.mounted") {
      Hooks.callAll("crpMountedChanged", this.document);
    }

  });

});


  // ======================
  //  NAZWA
  // ======================
  const nameEl = html.querySelector("[data-edit='name']");
  if (nameEl) {
    nameEl.addEventListener("blur", async ev => {
      await this.document.update({
        name: ev.currentTarget.innerText
      });
    });
  }

  // ======================
  //  PORTRET
  // ======================
  html.querySelectorAll("[data-edit='img']").forEach(img => {
    img.addEventListener("click", () => {
      new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: this.document.img,
        callback: async (path) => {

          const currentToken = this.document.prototypeToken?.texture?.src;
          const currentPortrait = this.document.img;

          const isDefaultToken =
            !currentToken || currentToken === currentPortrait;

          await this.document.update({
            img: path,
            ...(isDefaultToken && {
              "prototypeToken.texture.src": path
            })
          });

        }
      }).render(true);
    });
  });

  // ======================
  //  TOKEN
  // ======================
  html.querySelectorAll("[data-edit='token']").forEach(img => {
    img.addEventListener("click", () => {
      new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: this.document.prototypeToken?.texture?.src || this.document.img,
        callback: async (path) => {

          await this.document.update({
            "prototypeToken.texture.src": path
          });

        }
      }).render(true);
    });
  });

  // ======================
  //  EQUIP
  // ======================
  html.querySelectorAll(".crp-equip").forEach(el => {
    el.addEventListener("change", async ev => {

      const item = this.document.items.get(ev.target.dataset.itemId);
      if (!item) return;

      await item.update({
        "system.equipped": ev.target.checked
      });

    });
  });

//  USUWANIE PRZEDMIOTÓW
if (!html.dataset.deleteBound) {
  html.dataset.deleteBound = "true";

  html.addEventListener("click", async ev => {

  const btn = ev.target.closest(".crp-item-delete");

  if (!btn) return;

  ev.preventDefault();
  ev.stopPropagation();

  if (
    btn.closest(".crp-bio") &&
    game.settings.get("crp", "characterSheetsLocked")
  ) {
    ui.notifications.warn("Karta postaci jest zablokowana.");
    return;
  }

  const itemId = btn.dataset.itemId;

  if (!itemId) return;

  const item = this.document.items.get(itemId);

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "Usunąć przedmiot?"
    },
    content: `
      <p>
        Czy na pewno chcesz usunąć przedmiot
        <strong>${foundry.utils.escapeHTML(item?.name ?? "bez nazwy")}</strong>?
      </p>
    `,
    yes: {
      label: "Usuń",
      icon: "fa-solid fa-trash"
    },
    no: {
      label: "Anuluj",
      icon: "fa-solid fa-times"
    }
  });

  if (!confirmed) return;

  const eq = this.document.system.equipment;
  const updates = {};
  const slots = ["rightHand", "leftHand", "armor"];

  for (const slot of slots) {
    if (eq[slot]?.id === itemId) {
      updates[`system.equipment.${slot}`] = {
        id: null,
        name: null,
        img: null
      };
    }
  }

  if (this.document.system.bio?.origin?.id === itemId) {
    updates["system.bio.origin"] = {
      id: null,
      name: null,
      img: null
    };
  }

  this._rememberScrollPosition();
  await this.document.deleteEmbeddedDocuments("Item", [itemId]);

  if (Object.keys(updates).length) {
    this._rememberScrollPosition();
    await this.document.update(updates);
  }

});
}

  // ======================
  //  DRAG & DROP (FIX)
  // ======================
const root = this.element[0] ?? this.element;

// tylko DROP ma być jednokrotny
if (!root.dataset?.dropBound) {
  root.dataset.dropBound = "true";

  root.addEventListener("dragover", ev => ev.preventDefault());

  root.addEventListener("drop", async ev => {
    ev.preventDefault();

    if (this._dropping) return;
    this._dropping = true;

    try {
      const TextEditorImpl =
        foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;

      let data = TextEditorImpl.getDragEventData(ev);

      if (!data || !data.type) {
        try {
          data = JSON.parse(ev.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
      }

      if (data.type !== "Item") return;

      const item = await fromUuid(data.uuid);
      if (!item) return;

      const traitDrop = ev.target.closest?.(".crp-trait-drop");

      if (traitDrop) {
        await this._assignTrait(item, traitDrop.dataset.traitCategory);
        return;
      }

      const originDrop = ev.target.closest?.(".crp-origin-drop");

      if (originDrop) {
        await this._assignOrigin(item);
        return;
      }

      const languageDrop = ev.target.closest?.(".crp-language-drop");

      if (languageDrop) {
        await this._assignLanguage(item, languageDrop.dataset.languageRole);
        return;
      }

      if (item.type === "language") {
        ui.notifications.warn("Przeciągnij język do odpowiedniej sekcji w zakładce Biografia.");
        return;
      }

      if (item.type === "origin") {
        ui.notifications.warn("Przeciągnij Pochodzenie do odpowiedniego slotu w zakładce Biografia.");
        return;
      }

      if (item.type === "trait") {
        ui.notifications.warn("Przeciągnij Wadę lub Zaletę do odpowiedniej sekcji w zakładce Biografia.");
        return;
      }

      let slotEl = ev.target;

      while (slotEl && !slotEl.classList?.contains("crp-eq-slot")) {
        slotEl = slotEl.parentElement;
      }

if (slotEl) {
  const slot = slotEl.dataset.slot;

  if (item.parent?.id !== this.document.id) {
    ui.notifications.warn("Możesz używać tylko przedmiotów z ekwipunku!");
    return;
  }

  // 🔥 WALIDACJA SLOTU
  const isHand = slot === "rightHand" || slot === "leftHand";

  const valid =
    (slot === "armor" && item.type === "armor") ||
    (isHand && (item.type === "weapon" || item.type === "shield"));

  if (!valid) {
    ui.notifications.warn("Nie można umieścić tego przedmiotu w tym slocie");
    return;
  }

  const eq = this.document.system.equipment;

  const updates = {};
  const isTwoHandedWeapon = (item) =>
    item?.type === "weapon" && ["twoHanded", "ranged"].includes(item.system.skill);

  // Broń dwuręczna i strzelecka zawsze zajmuje obie ręce.
  if (isHand && isTwoHandedWeapon(item)) {
    const slotData = {
      id: item.id,
      name: item.name,
      img: item.img
    };

    updates["system.equipment.rightHand"] = slotData;
    updates["system.equipment.leftHand"] = slotData;

    this._rememberScrollPosition();
    await this.document.update(updates);

    return;
  }

  // 🔥 USUŃ Z DRUGIEGO SLOTU RĘKI
  if (isHand) {
    const otherSlot = slot === "rightHand" ? "leftHand" : "rightHand";
    const otherItemId = eq[otherSlot]?.id;
    const otherItem = otherItemId ? this.document.items.get(otherItemId) : null;

    if (otherItemId === item.id || isTwoHandedWeapon(otherItem)) {
      updates[`system.equipment.${otherSlot}`] = {
        id: null,
        name: null,
        img: null
      };
    }
  }

  // 🔥 USTAW W NOWYM SLOCIE
  updates[`system.equipment.${slot}`] = {
    id: item.id,
    name: item.name,
    img: item.img
  };

  this._rememberScrollPosition();
  await this.document.update(updates);
  this.render({force: true});
  return;
}

      if (item.parent?.id === this.document.id) return;

      const sourceActor = item.parent?.documentName === "Actor" ? item.parent : null;

      if (sourceActor && sourceActor.id !== this.document.id && !sourceActor.isOwner && !game.user.isGM) {
        ui.notifications.warn("Brak uprawnień do przeniesienia przedmiotu z aktora źródłowego.");
        return;
      }

      this._rememberScrollPosition();
      const itemData = item.toObject();
      delete itemData._id;

      const [created] = await this.document.createEmbeddedDocuments("Item", [itemData]);

      if (created.type === "weapon") {
        this._rememberScrollPosition();
        await created.update({ "system.equipped": true });
      }

      if (sourceActor && sourceActor.id !== this.document.id) {
        const sourceUpdates = {};
        const emptySlot = {
          id: null,
          name: null,
          img: null
        };

        for (const slot of ["rightHand", "leftHand", "armor"]) {
          if (sourceActor.system.equipment?.[slot]?.id === item.id) {
            sourceUpdates[`system.equipment.${slot}`] = emptySlot;
          }
        }

        if (Object.keys(sourceUpdates).length) {
          await sourceActor.update(sourceUpdates);
        }

        await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
        sourceActor.sheet?.render(false);
      }

    } finally {
      this._dropping = false;
    }
  });
}



html.querySelectorAll(".crp-item-row").forEach(el => {

  // ======================
  // DRAG
  // ======================
  el.addEventListener("dragstart", ev => {

    const itemId = el.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    ev.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      uuid: item.uuid
    }));

  });

  // ======================
  // CLICK → OTWÓRZ ITEM
  // ======================
  el.addEventListener("click", ev => {

    // ❗ NIE otwieraj przy kliknięciu delete
    if (ev.target.closest(".crp-item-delete")) return;

    const itemId = el.dataset.itemId;
    if (!itemId) return;

    const item = this.document.items.get(itemId);
    if (!item) return;

    item.sheet.render(true);
  });

});

html.querySelectorAll(".crp-eq-slot").forEach(el => {
  el.addEventListener("click", async ev => {

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
  isValidParryWeapon(rightItem) ||
  isValidParryWeapon(leftItem);

const hasEmptyHand =
  !equipment.rightHand?.id ||
  !equipment.leftHand?.id;

const canParry = hasParryWeapon || (isUnarmedAttack && hasEmptyHand);

  const isShield = (item) => item?.type === "shield";

const hasShield =
  isShield(rightItem) ||
  isShield(leftItem);

const mountedAdvantage = attackerMounted && !defenderMounted ? 2 : 0;
const attackChoice = await getAttackModifier(this.document, {
  allowManeuvers: !isNPCActor(this.document)
}).catch(() => null);

if (!attackChoice?.confirmed) return;

const selectedAttackModifier = attackChoice.modifier;
const maneuverCost = Math.max(0, Number(attackChoice.maneuverCost) || 0);
const currentManeuver = this.document.system.derived.maneuver?.value ?? 0;

if (maneuverCost > currentManeuver) {
  ui.notifications.warn("Brak wystarczającej liczby Punktów Manewru.");
  return;
}

if (maneuverCost > 0) {
  await this.document.update({
    "system.derived.maneuver.value": currentManeuver - maneuverCost
  });
}

const combat = game.combat;
const combatant = combat?.combatants.find(combatant => combatant.actor?.id === this.document.id);
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
  attackChoice.maneuver === "aimedAttack" &&
  !combat?.started;
const startsDefensiveAttack =
  attackChoice.maneuver === "defensiveAttack" &&
  combat?.started &&
  combatant;
const oneTimeDefensiveAttack =
  attackChoice.maneuver === "defensiveAttack" &&
  !combat?.started;

if (startsAimedAttack) {
  await this.document.setFlag("crp", "aimedAttack", {
    combatId: combat.id,
    combatantId: combatant.id,
    expiresRound: (combat.round ?? 0) + 1,
    bonus: 3
  });
}

if (startsDefensiveAttack) {
  await this.document.setFlag("crp", "defensiveAttack", {
    combatId: combat.id,
    combatantId: combatant.id,
    expiresRound: (combat.round ?? 0) + 1,
    bonus: 3
  });
}

if (oneTimeDefensiveAttack) {
  await this.document.setFlag("crp", "defensiveAttack", {
    oneTime: true,
    bonus: 3
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
`
});

await msg.update({
  content: msg.content.replace(
    'data-message-id=""',
    `data-message-id="${msg.id}"`
  )
});

  });
});

html.querySelectorAll(".crp-slot-clear").forEach(btn => {
  btn.addEventListener("click", async ev => {

    ev.stopPropagation();

    const slot = ev.currentTarget.dataset.slot;
    const eq = this.document.system.equipment;
    const itemId = eq[slot]?.id;
    const item = itemId ? this.document.items.get(itemId) : null;
    const updates = {};

    const clearSlot = (slot) => {
      updates[`system.equipment.${slot}`] = {
        id: null,
        name: null,
        img: null
      };
    };

    if (item?.type === "weapon" && ["twoHanded", "ranged"].includes(item.system.skill)) {
      clearSlot("rightHand");
      clearSlot("leftHand");
    } else {
      clearSlot(slot);
    }

this._rememberScrollPosition();
await this.document.update(updates);
this.render({force: true});

  });
});


// ======================
// TOKEN CONFIG BUTTON
// ======================
const header = this.element.querySelector(".window-header");

if (header && !header.querySelector(".crp-token-config")) {

  const btn = document.createElement("a");
  btn.classList.add("crp-token-config");
  //btn.innerHTML = "👤";
  // btn.innerHTML = `<img src="systems/crp/assets/token.svg" width="16" height="16">`;

btn.innerHTML = `
<svg class="crp-token-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dcdcdc" stroke-width="2">
  <circle cx="12" cy="8" r="4"/>
  <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
</svg>
`;

  btn.title = "Ustawienia tokena";

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const renderOptions = { force: true };
    const tokenDocument = [
      this.token?.document,
      this.token,
      this.options?.token?.document,
      this.options?.token,
      this.document.token
    ].find(candidate => candidate instanceof foundry.documents.TokenDocument) ?? null;

    if (tokenDocument?.sheet) {
      tokenDocument.sheet.render(renderOptions);
    } else {
      new CONFIG.Token.prototypeSheetClass({
        prototype: this.document.prototypeToken
      }).render(renderOptions);
    }


  });

  header.appendChild(btn);

// PRZESUŃ O 2 POZYCJE W LEWO (PEWNE)
const prev1 = btn.previousElementSibling;
const prev2 = prev1?.previousElementSibling;

if (prev2) {
  header.insertBefore(btn, prev2);
}
}

// ======================
// CLEAR MONEY
// ======================
html.querySelector(".crp-money-clear")?.addEventListener("click", async ev => {

  ev.preventDefault();
  ev.stopPropagation();

  const confirmed = await foundry.applications.api.DialogV2.confirm({

    window: {
      title: "Opróżnić sakiewkę?"
    },

    content: `
      <p>
        Czy na pewno chcesz usunąć wszystkie monety tej postaci?
      </p>
    `,

    yes: {
      label: "Opróżnij",
      icon: "fa-solid fa-coins"
    },

    no: {
      label: "Anuluj",
      icon: "fa-solid fa-times"
    }

  });

  if (!confirmed) return;

  const emptyMoney = normalizeMoney({
    grzywna: 0,
    skojec: 0,
    grosz: 0,
    kwartnik: 0,
    cwiercgrosz: 0,
    denar: 0,
    obol: 0
  });

  this._rememberScrollPosition();

  await this.document.update({
    "system.money": emptyMoney
  });

});

// ======================
// ADVANCEMENT
// ======================
html.querySelector(".crp-exp")?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();

  new CRPAdvancementWindow(this.document).render({ force: true });
});





// ======================
// BIO EDITOR
// ======================
html.querySelector(".crp-bio-edit")?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();

  this._openBioEditor();
});

html.querySelector(".crp-origin-drop")?.addEventListener("click", ev => {
  if (ev.target.closest(".crp-origin-clear")) return;

  const originId = this.document.system.bio?.origin?.id;
  this.document.items.get(originId)?.sheet?.render(true);
});

html.querySelector(".crp-origin-clear")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  if (game.settings.get("crp", "characterSheetsLocked")) {
    ui.notifications.warn("Karta postaci jest zablokowana.");
    return;
  }

  const originId = this.document.system.bio?.origin?.id;

  this._rememberScrollPosition();
  await this.document.update({
    "system.bio.origin": {
      id: null,
      name: null,
      img: null
    }
  });

  if (originId && this.document.items.get(originId)?.type === "origin") {
    this._rememberScrollPosition();
    await this.document.deleteEmbeddedDocuments("Item", [originId]);
  }
});

html.querySelector(".crp-crest-select")?.addEventListener("click", () => {
  new foundry.applications.apps.FilePicker.implementation({
    type: "image",
    current: this.document.system.bio?.crest || "",
    callback: async path => {
      this._rememberScrollPosition();
      await this.document.update({ "system.bio.crest": path });
    }
  }).render(true);
});

html.querySelector(".crp-crest-clear")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  this._rememberScrollPosition();
  await this.document.update({ "system.bio.crest": "" });
});

html.querySelector(".crp-use-advantage")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  const current = this.document.system.resources.advantageUses?.value ?? 0;

  if (current <= 0) {
    ui.notifications.warn("Brak dostępnych użyć Zalet.");
    return;
  }

  this._rememberScrollPosition();
  await this.document.update({
    "system.resources.advantageUses.value": Math.max(0, current - 1)
  });
});

html.querySelector(".crp-add-advantage-use")?.addEventListener("click", async ev => {
  ev.preventDefault();
  ev.stopPropagation();

  const current = this.document.system.resources.advantageUses?.value ?? 0;

  this._rememberScrollPosition();
  await this.document.update({
    "system.resources.advantageUses.value": current + 1
  });
});


}


}
function isNPCActor(actor) {
  return CRP_NPC_ACTOR_TYPES.has(actor?.type);
}

function getSkillAdvancementCost(skillValue, attrValue) {
  const baseCost = skillValue === 0 ? 2 : skillValue + 1;
  return skillValue + 1 > attrValue ? baseCost * 2 : baseCost;
}

async function getAttackModifier(actor, { allowManeuvers = true } = {}) {
  const strikeText = text => [...text].map(character => `${character}\u0336`).join("");
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
    { key: "disarm", cost: 4, implemented: false }
  ].map(maneuver => ({
    ...maneuver,
    name: game.i18n.localize(`CRP.Maneuvers.${maneuver.key}.name`),
    description: game.i18n.localize(`CRP.Maneuvers.${maneuver.key}.description`)
  })).sort((a, b) => {
    if (a.key === "none") return -1;
    if (b.key === "none") return 1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.name.localeCompare(b.name, game.i18n.lang);
  }).map(maneuver => ({
    ...maneuver,
    displayName: maneuver.implemented ? maneuver.name : strikeText(maneuver.name),
    disabled:
      maneuver.key !== "none" &&
      (hasActiveManeuver || maneuver.cost > availableManeuver)
  }));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/attack.hbs",
    {
      maneuver: actor.system.derived.maneuver,
      maneuvers,
      allowManeuvers
    }
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
          const value = Number(dialog.element.querySelector("input[name='attackModifier']")?.value ?? 0);
          const maneuverSelect = dialog.element.querySelector("select[name='maneuver']");
          const maneuverOption = maneuverSelect?.selectedOptions[0];
          const maneuverCost = Number(maneuverOption?.dataset.cost ?? 0);
          const maneuverDisabled = maneuverOption?.disabled;

          return {
            confirmed: true,
            modifier: Math.max(-4, Math.min(4, Number.isFinite(value) ? value : 0)),
            maneuver: allowManeuvers && !maneuverDisabled ? maneuverSelect?.value ?? "none" : "none",
            maneuverCost: allowManeuvers && !maneuverDisabled && Number.isFinite(maneuverCost) ? maneuverCost : 0
          };
        }
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false })
      }
    ],
    render: (_event, dialog) => {
      const input = dialog.element.querySelector("input[name='attackModifier']");
      const output = dialog.element.querySelector(".crp-attack-modifier-value");
      if (!input || !output) return;

      const refreshOutput = () => {
        const value = Number(input.value) || 0;
        output.value = value >= 0 ? `+${value}` : String(value);
      };

      input.addEventListener("input", refreshOutput);
      refreshOutput();

      const maneuverSelect = dialog.element.querySelector("select[name='maneuver']");
      const maneuverDescription = dialog.element.querySelector(".crp-attack-maneuver-description");

      if (maneuverSelect && maneuverDescription) {
        const refreshManeuverDescription = () => {
          const option = maneuverSelect.selectedOptions[0];
          maneuverDescription.textContent = option?.dataset.description ?? "";
        };

        maneuverSelect.addEventListener("change", refreshManeuverDescription);
        refreshManeuverDescription();
      }
    }
  });
}

async function getSkillModifier() {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/crp/templates/skills.hbs"
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
          const value = Number(dialog.element.querySelector("input[name='skillModifier']")?.value ?? 0);
          return {
            confirmed: true,
            modifier: Math.max(-4, Math.min(4, Number.isFinite(value) ? value : 0))
          };
        }
      },
      {
        action: "cancel",
        label: "Anuluj",
        callback: () => ({ confirmed: false })
      }
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
    }
  });
}