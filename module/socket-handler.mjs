import { CRPRoll } from "./rolls/roll.mjs";

export class SocketHandler {
  constructor() {
    this.identifier = "system.crp";
    this.registerSocketEvents();
  }
  registerSocketEvents() {
    game.socket.on(this.identifier, async (data) => {
      const operation = data.operation;
      switch (operation) {
        case "fortitudeRoll":
          const actor = game.actors.get(data.actorId);
            const content = await foundry.applications.handlebars.renderTemplate(
              "systems/crp/templates/dialogs/skills.hbs",
             );
           const dialog = await foundry.applications.api.DialogV2.wait({
    window: { title: "Test Tężyzny" },
    classes:["crp-dialog"],
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
    }
  });
        if (!dialog.result.confirmed) return;
        await CRPRoll.fortitude(actor, { chat: true, modifier: dialog.result.modifier });          
        break;
         
      }
    });
  }
  emit(data) {
    return game.socket.emit(this.identifier, data);
  }
}
