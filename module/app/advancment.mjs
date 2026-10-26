const { ApplicationV2, DocumentSheetV2, HandlebarsApplicationMixin } =
  foundry.applications.api;

export class CRPAdvancementWindow extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  static openWindows = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["crp", "advancement"],
    window: {
      title: "Rozwój postaci",
      resizable: true,
    },
    position: {
      width: 520,
      height: "auto",
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/advancement.hbs",
    },
  };

  constructor(actor) {
    super({
      id: `crp-advancement-${actor.id}`,
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
      root,
    ].filter((el) => el && typeof el.scrollTop === "number");

    return [...new Set(containers)];
  }

  _rememberScrollPosition() {
    const containers = this._getScrollContainers();
    const scrolled = containers.find((el) => el.scrollTop > 0);

    this._pendingScrollState = {
      main: scrolled?.scrollTop ?? containers[0]?.scrollTop ?? 0,
      log: this.element.querySelector(".crp-adv-log-entries")?.scrollTop ?? 0,
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
        skills: Object.keys(attrData?.skills ?? {}).map((sk) => {
          const skillValue = attrData.skills[sk].value ?? 0;
          const skillCost = this.getSkillAdvancementCost(skillValue, attrValue);

          return {
            key: sk,
            label: String(config.skills[sk]),
            value: skillValue,
            total: skillValue + attrValue,
            cost: skillCost,
            disabled: skillValue >= 10 || skillCost > freeExperience,
          };
        }),
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
        disabled: fateCost > freeExperience,
      },
      advancementLog: [...(system.resources.experience.log ?? [])].reverse(),
      attributesList,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._restoreScrollPosition();

    this.element
      .querySelectorAll("[data-advancement-type]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          if (button.disabled) return;

          const type = button.dataset.advancementType;
          const attr = button.dataset.attr;
          const skill = button.dataset.skill;
          const freeExperience =
            this.actor.system.resources.experience.free ?? 0;
          const fateMax = this.actor.system.resources.fate.max ?? 2;
          const attrValue = this.actor.system.attributes?.[attr]?.value ?? 0;
          const skillValue =
            this.actor.system.attributes?.[attr]?.skills?.[skill]?.value ?? 0;
          const cost =
            type === "fate"
              ? (fateMax + 1) * 3
              : type === "attribute"
                ? (attrValue + 1) * 4
                : this.getSkillAdvancementCost(skillValue, attrValue);

          if (freeExperience < cost) return;
          if (type === "attribute" && attrValue >= 10) return;
          if (type === "skill" && skillValue >= 10) return;

          button.disabled = true;

          const path =
            type === "fate"
              ? "system.resources.fate.max"
              : type === "attribute"
                ? `system.attributes.${attr}.value`
                : `system.attributes.${attr}.skills.${skill}.value`;
          const nextValue =
            type === "fate"
              ? fateMax + 1
              : type === "attribute"
                ? attrValue + 1
                : skillValue + 1;
          const label =
            type === "fate"
              ? "Dolę"
              : type === "attribute"
                ? String(CONFIG.CRP.attributes[attr])
                : String(CONFIG.CRP.skills[skill]);
          const log = [
            ...(this.actor.system.resources.experience.log ?? []),
            {
              date: new Date().toLocaleString("pl-PL"),
              text: `Zwiększono ${label} do ${nextValue} (koszt: ${cost} PD).`,
            },
          ];

          this._rememberScrollPosition();

          try {
            const updates = {
              [path]: nextValue,
              "system.resources.experience.free": freeExperience - cost,
              "system.resources.experience.log": log,
            };

            if (type === "attribute" && attr === "reason") {
              const advantageUses =
                this.actor.system.resources.advantageUses?.value ?? 0;
              updates["system.resources.advantageUses.value"] =
                advantageUses + 1;
            }

            await this.actor.update(updates);
          } finally {
            this.render({ force: true });
          }
        });
      });
  }
  getSkillAdvancementCost(skillValue, attrValue) {
    const baseCost = skillValue === 0 ? 2 : skillValue + 1;
    return skillValue + 1 > attrValue ? baseCost * 2 : baseCost;
  }
}
