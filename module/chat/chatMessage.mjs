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
  async regenerateSkillRoll(){
    const data = this.system.crp;
    if (!data) return;
    const agonia = data.agonia;
    let content;
    if(agonia){
      data.rollLabel += "<br><strong>Test Agoni</strong>"
          content = await foundry.applications.handlebars.renderTemplate(
      "systems/crp/templates/chat/agonia-roll.hbs",
      {
        ...data,
        messageId: this.id,
      },
    );
    }else{
    content = await foundry.applications.handlebars.renderTemplate(
      "systems/crp/templates/chat/skill-roll.hbs",
      {
        ...data,
        messageId: this.id,
      },
    );
  }
    await this.update({ content });
  }
  async maneuverToChat(){
    const data = this.system.crp; 
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/crp/templates/chat/maneuver.hbs",
      {
        ...data,
        messageId: this.id,
      },
    );

    await this.update({ content });
  }
  async regenerateOpositeRoll(){
    const data = this.system.crp; 
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/crp/templates/chat/oposite-test.hbs",
      {
        ...data,
        messageId: this.id,
      },
    );

    await this.update({ content });
  }
}
