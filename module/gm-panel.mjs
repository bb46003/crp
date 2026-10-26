const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CRPGMPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crp-gm-panel",
    classes: ["crp", "gm-panel"],
    window: {
      title: "CRP – Panel MG",
      resizable: true,
    },
    position: {
      width: 650,
      height: "auto",
    },
  };

  static PARTS = {
    body: {
      template: "systems/crp/templates/gm-panel.hbs",
    },
  };

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;

    html.querySelectorAll(".crp-actor-row").forEach((row) => {
      row.addEventListener("click", (ev) => {
        ev.preventDefault();

        const checkbox = row.querySelector("input");
        if (!checkbox) return;

        checkbox.checked = !checkbox.checked;
      });
    });

    html
      .querySelector("[data-action='give-fate-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actorId = checkbox.value;
          const actor = game.actors.get(actorId);
          if (!actor) continue;

          const current = actor.system.resources.fate.value ?? 0;
          const max = actor.system.resources.fate.max ?? 2;

          await actor.update({
            "system.resources.fate.value": Math.min(current + 1, max),
          });
        }

        ui.notifications.info("✨ Dodano +1 Doli wybranym");

        this.render(); // odśwież panel (ważne!)
      });

    html
      .querySelector("[data-action='spend-fate-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actorId = checkbox.value;
          const actor = game.actors.get(actorId);
          if (!actor) continue;

          const current = actor.system.resources.fate.value ?? 0;

          await actor.update({
            "system.resources.fate.value": Math.max(current - 1, 0),
          });
        }

        ui.notifications.info("Odjęto -1 Doli wybranym");

        this.render();
      });

    html
      .querySelector("[data-action='give-xp-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        const content = `
    <div class="form-group">
      <label>Wartość PD</label>
      <input type="number" name="xp" value="1" min="0" step="1">
    </div>
    <div class="form-group">
      <label>Tytuł sesji</label>
      <input type="text" name="sessionTitle" placeholder="Opcjonalnie">
    </div>
  `;

        const result = await foundry.applications.api.DialogV2.wait({
          window: { title: "Rozdaj PD" },
          content,
          buttons: [
            {
              action: "confirm",
              label: "Rozdaj",
              default: true,
              callback: (_event, _button, dialog) => ({
                xp:
                  dialog.element.querySelector("input[name='xp']")?.value ?? "",
                sessionTitle:
                  dialog.element
                    .querySelector("input[name='sessionTitle']")
                    ?.value.trim() ?? "",
              }),
            },
            {
              action: "cancel",
              label: "Anuluj",
              callback: () => null,
            },
          ],
        });

        if (result === null) return;

        const xpInput = String(result.xp).trim();
        const xp = Number(xpInput);
        const sessionTitle = result.sessionTitle;
        const sessionLabel = sessionTitle
          ? `za sesję ${sessionTitle}`
          : `za sesję z ${new Date().toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}`;

        if (
          !xpInput ||
          !Number.isFinite(xp) ||
          !Number.isInteger(xp) ||
          xp < 0
        ) {
          ui.notifications.warn("Podaj poprawną, całkowitą wartość PD");
          return;
        }

        for (const checkbox of selected) {
          const actorId = checkbox.value;
          const actor = game.actors.get(actorId);
          if (!actor) continue;

          const current = actor.system.resources.experience?.value ?? 0;
          const free = actor.system.resources.experience?.free ?? 0;
          const log = [
            ...(actor.system.resources.experience?.log ?? []),
            {
              date: new Date().toLocaleString("pl-PL"),
              text: `Przyznano ${xp} PD ${sessionLabel}.`,
            },
          ];

          await actor.update({
            "system.resources.experience.value": current + xp,
            "system.resources.experience.free": free + xp,
            "system.resources.experience.log": log,
          });
        }

        ui.notifications.info(`Dodano ${xp} PD wybranym`);

        this.render();
      });

    html
      .querySelector("[data-action='give-maneuver-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          const current = actor.system.derived.maneuver?.value ?? 0;
          const max = actor.system.derived.maneuver?.max ?? 0;

          await actor.update({
            "system.derived.maneuver.value": Math.min(current + 1, max),
          });
        }

        ui.notifications.info("Dodano +1 punkt manewru zaznaczonym");
        this.render();
      });

    html
      .querySelector("[data-action='spend-maneuver-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          const current = actor.system.derived.maneuver?.value ?? 0;

          await actor.update({
            "system.derived.maneuver.value": Math.max(current - 1, 0),
          });
        }

        ui.notifications.info("Odjęto -1 punkt manewru zaznaczonym");
        this.render();
      });

    html
      .querySelector("[data-action='give-advantageUses-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          const current = actor.system.resources.advantageUses?.value ?? 0;

          await actor.update({
            "system.resources.advantageUses.value": current + 1,
          });
        }

        ui.notifications.info("Dodano +1 użycie Zalety zaznaczonym");
        this.render();
      });

    html
      .querySelector("[data-action='spend-advantageUses-selected']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          const current = actor.system.resources.advantageUses?.value ?? 0;

          await actor.update({
            "system.resources.advantageUses.value": Math.max(current - 1, 0),
          });
        }

        ui.notifications.info("Odjęto -1 użycie Zalety zaznaczonym");
        this.render();
      });

    html
      .querySelector("[data-action='toggle-all']")
      ?.addEventListener("click", () => {
        const checkboxes = html.querySelectorAll(".crp-actor-row input");
        const allChecked = [...checkboxes].every((cb) => cb.checked);

        checkboxes.forEach((cb) => (cb.checked = !allChecked));
      });

    // 🎲 RESET DOLI
    html
      .querySelector("[data-action='reset-fate']")
      ?.addEventListener("click", async () => {
        for (const actor of game.actors.contents) {
          if (actor.type !== "character" || !actor.hasPlayerOwner) continue;

          await actor.update({
            "system.resources.fate.value": actor.system.resources.fate.max ?? 2,
          });
        }

        ui.notifications.info("✨ Dola przywrócona do limitu");

        this.render(); // odśwież panel
      });

    html
      .querySelector("[data-action='reset-maneuvers']")
      ?.addEventListener("click", async () => {
        for (const actor of game.actors.contents) {
          if (actor.type !== "character" || !actor.hasPlayerOwner) continue;

          await actor.update({
            "system.derived.maneuver.value":
              actor.system.derived.maneuver?.max ?? 0,
          });
        }

        ui.notifications.info("Punkty manewru przywrócone do limitu");
        this.render();
      });

    // ➕ +1 DOLA
    html
      .querySelector("[data-action='give-fate']")
      ?.addEventListener("click", async () => {
        for (const actor of game.actors.contents) {
          if (actor.type !== "character" || !actor.hasPlayerOwner) continue;

          const current = actor.system.resources.fate.value ?? 0;
          const max = actor.system.resources.fate.max ?? 2;

          await actor.update({
            "system.resources.fate.value": Math.min(current + 1, max),
          });
        }

        ui.notifications.info("✨ Dodano +1 Doli");
      });

    // ❤️ HEAL
    html
      .querySelector("[data-action='heal-all']")
      ?.addEventListener("click", async () => {
        for (const actor of game.actors.contents) {
          if (actor.type !== "character" || !actor.hasPlayerOwner) continue;

          const max = actor.system.derived.health.max;

          await actor.update({
            "system.derived.health.value": max,
          });
        }

        ui.notifications.info("❤️ Wszyscy wyleczeni");
      });

    html
      .querySelector("[data-action='toggle-sheet-lock']")
      ?.addEventListener("click", async () => {
        const locked = game.settings.get("crp", "characterSheetsLocked");

        await game.settings.set("crp", "characterSheetsLocked", !locked);

        ui.notifications.info(
          locked ? "Karty postaci odblokowane" : "Karty postaci zablokowane",
        );
        this.render();
      });

    html
      .querySelector("[data-action='clear-advancement-logs']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Wyczyść logi rozwoju" },
          content:
            "<p>Czy na pewno chcesz usunąć logi rozwoju zaznaczonych postaci?</p>",
          yes: { label: "Wyczyść" },
          no: { label: "Anuluj" },
        });

        if (!confirmed) return;

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          await actor.update({
            "system.resources.experience.log": [],
          });
        }

        ui.notifications.info("Wyczyszczono logi rozwoju zaznaczonych postaci");
      });

    html
      .querySelector("[data-action='add-advancement-log']")
      ?.addEventListener("click", async () => {
        const selected = html.querySelectorAll(".crp-actor-row input:checked");

        if (!selected.length) {
          ui.notifications.warn("Wybierz przynajmniej jednego gracza");
          return;
        }

        let text;

        try {
          text = await foundry.applications.api.DialogV2.wait({
            window: { title: "Dodaj wpis do logu rozwoju" },
            content: `
          <div class="form-group">
            <label>Treść wpisu</label>
            <input type="text" name="text">
          </div>
        `,
            buttons: [
              {
                action: "confirm",
                label: "Dodaj",
                default: true,
                callback: (_event, _button, dialog) =>
                  dialog.element
                    .querySelector("input[name='text']")
                    ?.value.trim() ?? "",
              },
              {
                action: "cancel",
                label: "Anuluj",
                callback: () => null,
              },
            ],
          });
        } catch (error) {
          console.error(
            "CRP: Nie udało się otworzyć dialogu wpisu logu",
            error,
          );
          ui.notifications.error("Nie udało się otworzyć okna wpisu logu");
          return;
        }

        if (text === null) return;

        if (!text) {
          ui.notifications.warn("Wpisz treść komunikatu");
          return;
        }

        for (const checkbox of selected) {
          const actor = game.actors.get(checkbox.value);
          if (!actor) continue;

          const log = [
            ...(actor.system.resources.experience?.log ?? []),
            {
              date: new Date().toLocaleString("pl-PL"),
              text,
            },
          ];

          await actor.update({
            "system.resources.experience.log": log,
          });
        }

        ui.notifications.info(
          "Dodano wpis do logu rozwoju zaznaczonych postaci",
        );
      });
  }

  _prepareContext() {
    const actors = game.actors.contents
      .filter((a) => a.type === "character" && a.hasPlayerOwner)
      .map((a) => ({
        id: a.id,
        name: a.name,
        maneuver: a.system.derived.maneuver?.value ?? 0,
        maneuverMax: a.system.derived.maneuver?.max ?? 0,
        fate: a.system.resources.fate.value,
        fateMax: a.system.resources.fate.max ?? 2,
        advantageUses: a.system.resources.advantageUses?.value ?? 0,
        experience: a.system.resources.experience?.value ?? 0,
        experienceFree: a.system.resources.experience?.free ?? 0,
      }));

    return {
      actors,
      characterSheetsLocked: game.settings.get("crp", "characterSheetsLocked"),
    };
  }
}
