import { formatMoney, obolsToMoney, normalizeMoney } from "../currency.mjs";

const { DocumentSheetV2, HandlebarsApplicationMixin } =
  foundry.applications.api;
const ORIGIN_SKILL_BUDGET = 14;
const ORIGIN_SKILL_COSTS = Object.freeze({
  1: 2,
  2: 4,
  3: 7,
});

export class CRPItemSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["crp", "sheet", "item"],
    tag: "section",
    window: {
      title: "CRP Item",
      resizable: true,
    },
    position: {
      width: 450,
      height: "auto",
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/item/item-sheet.hbs",
    },
  };

  static getDefaultOptions() {
    const options = super.getDefaultOptions();
    return options;
  }

  _getRootElement() {
    return this.element instanceof HTMLElement
      ? this.element
      : this.element?.[0];
  }

  _getScrollContainers(root = this._getRootElement()) {
    const containers = [
      root?.closest?.(".window-content"),
      root?.querySelector(".window-content"),
      root?.querySelector(".crp-item"),
      root,
    ].filter((el) => el && typeof el.scrollTop === "number");

    return [...new Set(containers)];
  }

  _getScrollTop() {
    const containers = this._getScrollContainers();
    const scrolled = containers.find((el) => el.scrollTop > 0);

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

  _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    const system = this.document.system;

    const itemWeights = CONFIG.CRP.itemWeights ?? {};

    const weight = Object.hasOwn(itemWeights, system.weight)
      ? system.weight
      : "Ś";

    return {
      ...context,
      system,
      item: this.document,
      config: CONFIG.CRP,
      itemWeight: weight,

      formattedPrice: formatMoney(obolsToMoney(system.price.total)),
    };
  }

  _onRender(context, options) {
    const scrollTop = this._pendingScrollTop;

    super._onRender(context, options);

    const html = this._getRootElement();
    if (!html) return;

    this._restoreScrollPosition(scrollTop);
    this._pendingScrollTop = undefined;

    html
      .querySelectorAll(
        "input[data-path], textarea[data-path], select[data-path]",
      )
      .forEach((input) => {
        input.addEventListener("change", async (ev) => {
          const path = ev.currentTarget.dataset.path;
          let value = ev.currentTarget.value;

          if (ev.currentTarget.type === "number") {
            value = Number(value);
            if (isNaN(value)) value = 0;
          }

          // SPECJALNIE DLA NAME
          if (path === "name") {
            this._rememberScrollPosition();
            await this.document.update({ name: value });
          } else {
            if (path.startsWith("system.price")) {
              const key = path.replace("system.price.", "");
              const price = foundry.utils.deepClone(this.document.system.price);
              price[key] = value;
              const normalized = normalizeMoney(price);

              this._rememberScrollPosition();
              await this.document.update({
                "system.price": normalized,
              });

              return;
            }

            this._rememberScrollPosition();
            await this.document.update({
              [path]: value,
            });
          }
        });
      });

    html.querySelectorAll("[data-edit='name']").forEach((nameEl) => {
      nameEl.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;

        ev.preventDefault();
        ev.currentTarget.blur();
      });

      nameEl.addEventListener("blur", async (ev) => {
        const name = ev.currentTarget.innerText.trim();
        if (!name || name === this.document.name) return;

        this._rememberScrollPosition();
        await this.document.update({ name });
      });
    });

    html.querySelectorAll("[data-edit='img']").forEach((img) => {
      img.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img,
          callback: async (path) => {
            this._rememberScrollPosition();
            await this.document.update({
              img: path,
            });
          },
        }).render(true);
      });
    });

    // KLIK BRONI = EQUIP
    html.querySelectorAll(".crp-weapon-row").forEach((row) => {
      row.addEventListener("click", async (ev) => {
        const itemId = row.dataset.itemId;
        const item = this.document.items.get(itemId);

        if (!item) return;

        // zdejmij inne bronie
        for (const i of this.document.items) {
          if (i.type === "weapon" && i.id !== item.id && i.system.equipped) {
            this._rememberScrollPosition();
            await i.update({ "system.equipped": false });
          }
        }

        // toggle tej
        this._rememberScrollPosition();
        await item.update({
          "system.equipped": !item.system.equipped,
        });
      });
    });
  }
}

export class CRPWeaponSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/weapon-sheet.hbs",
    },
  };
}

export class CRPArmorSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/armor-sheet.hbs",
    },
  };
}

export class CRPShieldSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/shield-sheet.hbs",
    },
  };
}

export class CRPStuffSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/stuff-sheet.hbs",
    },
  };
}

export class CRPLanguageSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/language-sheet.hbs",
    },
  };

  _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    return {
      ...context,
      system: this.document.system,
      item: this.document,
      alphabets: {
        latin: "Łaciński",
        cyrillic: "Cyrylica",
        arabic: "Arabski",
        none: "Brak",
      },
    };
  }
}

export class CRPOriginSheet extends CRPItemSheet {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    position: {
      width: 620,
      height: "auto",
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/item/origin-sheet.hbs",
    },
  };

  _getSkillSelections() {
    return Array.from(this.document.system.skills ?? [], (selection) => ({
      key: selection.key,
      level: Number(selection.level),
    }));
  }

  _getSkillCost(level) {
    return ORIGIN_SKILL_COSTS[level] ?? 0;
  }

  _getUsedSkillPoints(selections = this._getSkillSelections()) {
    return selections.reduce(
      (total, selection) => total + this._getSkillCost(selection.level),
      0,
    );
  }

  async _updateSkills(selections) {
    const used = this._getUsedSkillPoints(selections);

    if (used > ORIGIN_SKILL_BUDGET) {
      ui.notifications.warn(
        "Wybrane umiejętności przekraczają limit 14 punktów.",
      );
      return false;
    }

    if (
      new Set(selections.map((selection) => selection.key)).size !==
      selections.length
    ) {
      ui.notifications.warn("Każdą umiejętność można wybrać tylko raz.");
      return false;
    }

    this._rememberScrollPosition();
    await this.document.update({ "system.skills": selections });
    return true;
  }

  _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    const selections = this._getSkillSelections();
    const selectedKeys = new Set(selections.map((selection) => selection.key));
    const used = this._getUsedSkillPoints(selections);
    const remaining = ORIGIN_SKILL_BUDGET - used;
    const skillEntries = Object.entries(CONFIG.CRP.skills);

    const skillRows = selections.map((selection, index) => ({
      index,
      key: selection.key,
      level: selection.level,
      cost: this._getSkillCost(selection.level),
      skillOptions: skillEntries.map(([key, label]) => ({
        key,
        label,
        selected: key === selection.key,
        disabled: key !== selection.key && selectedKeys.has(key),
      })),
      levelOptions: [1, 2, 3].map((level) => ({
        level,
        cost: this._getSkillCost(level),
        selected: level === selection.level,
        disabled:
          used -
            this._getSkillCost(selection.level) +
            this._getSkillCost(level) >
          ORIGIN_SKILL_BUDGET,
      })),
    }));

    const languageUuid = this.document.system.language;
    const language =
      languageUuid && languageUuid !== "none"
        ? fromUuidSync(languageUuid)
        : null;

    return {
      ...context,
      system: this.document.system,
      item: this.document,
      attributes: CONFIG.CRP.attributes,
      skillRows,
      skillBudget: {
        used,
        remaining,
        total: ORIGIN_SKILL_BUDGET,
      },
      canAddSkill:
        remaining >= ORIGIN_SKILL_COSTS[1] &&
        selectedKeys.size < skillEntries.length,
      language,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this._getRootElement();
    if (!html) return;

    const languageDrop = html.querySelector(".crp-origin-language-drop");

    languageDrop?.addEventListener("dragover", (event) => {
      event.preventDefault();
      languageDrop.classList.add("drag-over");
    });

    languageDrop?.addEventListener("dragleave", () => {
      languageDrop.classList.remove("drag-over");
    });

    languageDrop?.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      languageDrop.classList.remove("drag-over");

      const TextEditorImpl =
        foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      let data = TextEditorImpl.getDragEventData(event);

      if (!data?.type) {
        try {
          data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
      }

      if (data.type !== "Item") {
        ui.notifications.warn(
          "W tym polu można umieścić tylko Item typu Język.",
        );
        return;
      }

      const item = await fromUuid(data.uuid);

      if (!item || item.type !== "language") {
        ui.notifications.warn(
          "W tym polu można umieścić tylko Item typu Język.",
        );
        return;
      }

      this._rememberScrollPosition();
      await this.document.update({ "system.language": item.uuid });
    });

    languageDrop?.addEventListener("click", (event) => {
      if (event.target.closest(".crp-origin-language-clear")) return;

      const languageUuid = this.document.system.language;
      if (!languageUuid || languageUuid === "none") return;

      fromUuidSync(languageUuid)?.sheet?.render(true);
    });

    html
      .querySelector(".crp-origin-language-clear")
      ?.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        this._rememberScrollPosition();
        await this.document.update({ "system.language": "none" });
      });

    html.querySelectorAll(".crp-origin-skill-key").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const index = Number(event.currentTarget.dataset.index);
        const selections = this._getSkillSelections();
        selections[index].key = event.currentTarget.value;

        if (!(await this._updateSkills(selections))) {
          this.render(false);
        }
      });
    });

    html.querySelectorAll(".crp-origin-skill-level").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const index = Number(event.currentTarget.dataset.index);
        const selections = this._getSkillSelections();
        selections[index].level = Number(event.currentTarget.value);

        if (!(await this._updateSkills(selections))) {
          this.render(false);
        }
      });
    });

    html
      .querySelector(".crp-origin-skill-add")
      ?.addEventListener("click", async (event) => {
        event.preventDefault();

        const selections = this._getSkillSelections();
        const selectedKeys = new Set(
          selections.map((selection) => selection.key),
        );
        const nextSkill = Object.keys(CONFIG.CRP.skills).find(
          (key) => !selectedKeys.has(key),
        );

        if (
          !nextSkill ||
          this._getUsedSkillPoints(selections) + ORIGIN_SKILL_COSTS[1] >
            ORIGIN_SKILL_BUDGET
        ) {
          ui.notifications.warn("Brak punktów na kolejną umiejętność.");
          return;
        }

        selections.push({ key: nextSkill, level: 1 });
        await this._updateSkills(selections);
      });

    html.querySelectorAll(".crp-origin-skill-remove").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();

        const index = Number(event.currentTarget.dataset.index);
        const selections = this._getSkillSelections();
        selections.splice(index, 1);
        await this._updateSkills(selections);
      });
    });
  }
}

export class CRPTraitSheet extends CRPItemSheet {
  static PARTS = {
    body: {
      template: "systems/crp/templates/item/trait-sheet.hbs",
    },
  };

  _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    return {
      ...context,
      system: this.document.system,
      item: this.document,
    };
  }
}
