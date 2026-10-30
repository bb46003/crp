export class CRPChatMessage extends ChatMessage {
  async renderHTML(options = {}) {
    const html = await super.renderHTML(options);

    html.classList.add("crp-chat");

    return html;
  }
  async regenerateAtakRollContent() {
    const data = this.system.crp;

    if (!data) return;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/crp/templates/chat/atak-roll.hbs",
      {
        ...data,
        messageId: this.id,
      },
    );

    await this.update({ content });
  }
}
