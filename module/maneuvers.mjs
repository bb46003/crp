const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CRPManeuverDialog extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["crp"],
    window: {
      title: "Manewry",
      resizable: false,
    },
    position: {
      width: 500,
      height: 500,
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/maneuvers.hbs",
    },
  };

  constructor(actors) {
    super({
      id: `crp-maneuver-${foundry.utils.randomID()}`,
    });

    this.actors = Array.isArray(actors) ? actors : [actors];
    this._timer = null;
  }

  _preparePartContext(partId, context) {
    if (partId !== "body") return context;

    const actors = this.actors.map((actor) => ({
      name: actor.name,
      img: actor.prototypeToken?.texture?.src || actor.img,
    }));

    return {
      ...context,
      actors,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    const root = html instanceof HTMLElement ? html : html?.[0];

    if (!root) return;

    // BUTTON
    root.querySelector(".crp-close")?.addEventListener("click", () => {
      this.close();
    });

    // ======================
    // COUNTDOWN
    // ======================
    let time = 10;

    const counterEl = root.querySelector(".crp-timer");

    if (counterEl) {
      counterEl.innerText = time;
    }

    const interval = setInterval(() => {
      time--;

      if (counterEl) {
        counterEl.innerText = time;
      }

      if (time <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    // AUTO CLOSE
    this._timer = setTimeout(() => {
      clearInterval(interval);
      this.close();
    }, 10000);
  }

  async close(options) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    return super.close(options);
  }
}
