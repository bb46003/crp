export class CRPMigration {
  constructor(currentVersion) {
    this.currentVersion = currentVersion;
  }
  migrate() {
    if (this.currentVersion === "0.2.0") {
      this.migrateTo_0_2_0();
    }
  }
  async migrateTo_0_2_0() {
    const actors = game.actors.contents;
    for (const actor of actors) {
      const dependedTokens = actor.getDependentTokens();
      if (actor.type === "character") {
        actor.update({
          "prototypeToken.sight.enabled": true,
          "prototypeToken.actorLink": true,
        });
        for (const token of dependedTokens) {
          const data = {
            "token.sight.enabled": true,
            "token.actorLink": true,
          };
          await token.update(data);
        }
      } else {
        actor.update({
          "prototypeToken.sight.enabled": true,
        });
        for (const token of dependedTokens) {
          const data = {
            "token.sight.enabled": true,
          };
          await token.update(data);
        }
      }
      const scenes = game.scenes;
      for (const scene of scenes) {
        const tokens = scene.tokens;
        if (tokens.length > 0) {
          const data = {
            tokenVision: true,
            fog: {
              exploration: true,
            },
            environment: {
              globalLight: {
                enabled: true,
              },
            },
          };
          scene.updateSource(data);
        }
      }
    }
  }
}
