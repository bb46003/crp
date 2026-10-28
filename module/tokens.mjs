const CRP_MOUNT_UNDERLAY = "systems/crp/assets/wierzchowiec.webp";

export class CRPToken extends foundry.canvas.placeables.Token {
  static UNDERLAY_NAME = "crp-mounted-underlay";
  static UNDERLAY_SCALE = 1.45;

  /** @type {PIXI.Sprite|null} */
  constructor(...args) {
    super(...args);

  }
  /**
   * Remove the mounted underlay.
   */
  removeMountedUnderlay() {
    const sprite = this._crpMountUnderlay;
    if (!sprite) return;

    this._crpMountUnderlay = null;

    sprite.destroy({ children: true });
  }

  /**
   * Create or refresh the mounted underlay.
   */
  async refreshMountedUnderlay() {
    const mounted = this.actor?.system?.equipment?.mounted;

    if (!mounted) {
      this.removeMountedUnderlay();
      return;
    }

    if (!canvas?.ready || !this.mesh?.parent) return;

    let sprite = this._crpMountUnderlay;

    // Create the sprite only when necessary.
    if (!sprite || sprite.destroyed) {
      const texture = await foundry.canvas.loadTexture(CRP_MOUNT_UNDERLAY);
      if (!texture || this.destroyed) return;

      // The token could have been unmounted while loading the texture.
      if (!this.actor?.system?.equipment?.mounted) return;

      sprite = PIXI.Sprite.from(texture);
      sprite.name = CRPToken.UNDERLAY_NAME;
      sprite.eventMode = "none";
      sprite.interactive = false;

      this._crpMountUnderlay = sprite;

      // Remove duplicate underlays from the same container.
      for (const child of this.mesh.parent.children) {
        if (
          child.name === CRPToken.UNDERLAY_NAME &&
          child !== sprite
        ) {
          child.destroy();
        }
      }
    }

    const parent = this.mesh.parent;

    // Move the sprite if the token's container changed.
    if (sprite.parent && sprite.parent !== parent) {
      sprite.parent.removeChild(sprite);
    }

    // Keep the underlay immediately behind the token mesh.
    if (!sprite.parent) {
      const meshIndex = parent.getChildIndex(this.mesh);
      parent.addChildAt(sprite, Math.max(0, meshIndex));
    }

    // Synchronize transform and visibility.
    sprite.position.copyFrom(this.mesh.position);

    const { width, height } = this.document.getSize();

    sprite.anchor.set(0.5);
    sprite.width = width * CRPToken.UNDERLAY_SCALE;
    sprite.height = height * CRPToken.UNDERLAY_SCALE;

    sprite.angle = this.document.rotation ?? 0;
    sprite.alpha = this.document.alpha ?? 1;
    sprite.visible = this.mesh.visible !== false;

    // Restore the correct layer order if necessary.
    const meshIndex = parent.getChildIndex(this.mesh);
    const spriteIndex = parent.getChildIndex(sprite);

    if (spriteIndex > meshIndex) {
      parent.setChildIndex(sprite, Math.max(0, meshIndex));
    }
console.log({
  meshPosition: this.mesh.position,
  spritePosition: sprite.position,
  meshWorld: this.mesh.getGlobalPosition(new PIXI.Point()),
  spriteWorld: sprite.getGlobalPosition(new PIXI.Point()),
  meshIndex: parent.getChildIndex(this.mesh),
  spriteIndex: parent.getChildIndex(sprite),
  spriteVisible: sprite.visible,
  spriteAlpha: sprite.alpha,
  spriteSize: {
    width: sprite.width,
    height: sprite.height,
  },
});
  }
_refreshMountedUnderlayPosition() {
  const sprite = this._crpMountUnderlay;
  if (!sprite || sprite.destroyed || !this.mesh?.parent) return;

  const parent = this.mesh.parent;

if (sprite.parent !== parent) {
  sprite.removeFromParent();
  parent.addChild(sprite);
}

// Najpierw ustaw pozycję.
sprite.position.copyFrom(this.mesh.position);

// Następnie umieść sprite bezpośrednio przed meshem w kolejności dzieci,
// czyli pod nim, jeśli mesh jest renderowany później.
const meshIndex = parent.getChildIndex(this.mesh);
parent.setChildIndex(sprite, meshIndex);
  const spriteIndex = parent.getChildIndex(sprite);

  if (spriteIndex > meshIndex) {
    parent.setChildIndex(sprite, meshIndex);
  }
}
  /**
   * Refresh the underlay after Foundry refreshes the token.
   */
refresh(...args) {
  super.refresh(...args);

  this._refreshMountedUnderlayPosition();
  void this.refreshMountedUnderlay();
}

  /**
   * Clean up when the placeable is destroyed.
   */
  _destroy(options) {
    this.removeMountedUnderlay();
    return super._destroy(options);
  }

  /**
   * Get all active canvas tokens belonging to an actor.
   */
  static getMountedActorTokens(actor) {
    const tokens = new Set(actor?.getActiveTokens?.(false) ?? []);

    if (!canvas?.ready) return [...tokens];

    for (const token of canvas.tokens?.placeables ?? []) {
      const tokenActor = token.actor;

      const matchesActor =
        tokenActor === actor ||
        tokenActor?.uuid === actor?.uuid ||
        tokenActor?.id === actor?.id ||
        token.document?.actorId === actor?.id;

      if (matchesActor) tokens.add(token);
    }

    return [...tokens];
  }

  /**
   * Refresh mounted underlays for all tokens belonging to an actor.
   */
  static refreshMountedActorUnderlays(actor) {
    for (const token of this.getMountedActorTokens(actor)) {
      if (token instanceof CRPToken) {
        void token.refreshMountedUnderlay();
      }
    }
  }

  /**
   * Check whether an update contains a mounted-state change.
   */
  static hasMountedStateChanged(changed) {
    const paths = [
      "actorData.system.equipment.mounted",
      "delta.system.equipment.mounted",
      "system.equipment.mounted",
    ];

    return paths.some((path) => {
      // Foundry updates can contain flattened paths.
      if (Object.hasOwn(changed ?? {}, path)) return true;

      // Also support nested update objects.
      return foundry.utils.getProperty(changed, path) !== undefined;
    });
  }

  /**
   * Register the hooks that cannot be handled by the token's own lifecycle.
   */
  static initializeHooks() {
    Hooks.on("canvasReady", () => {
      for (const token of canvas.tokens?.placeables ?? []) {
        if (token instanceof CRPToken) {
          void token.refreshMountedUnderlay();
        }
      }
    });

    Hooks.on("drawToken", (token) => {
      if (token instanceof CRPToken) {
        void token.refreshMountedUnderlay();
      }
    });
Hooks.on("refreshToken", (token) => {
  if (token instanceof CRPToken) {
    token._refreshMountedUnderlayPosition();
  }
});
    Hooks.on("deleteToken", (tokenDocument) => {
      const token = tokenDocument?.object;

      if (token instanceof CRPToken) {
        token.removeMountedUnderlay();
      }
    });

    Hooks.on("crpMountedChanged", (actor) => {
      CRPToken.refreshMountedActorUnderlays(actor);
    });

    Hooks.on("updateToken", (tokenDocument, changed) => {
      if (!CRPToken.hasMountedStateChanged(changed)) return;

      const token = tokenDocument?.object;

      if (token instanceof CRPToken) {
        void token.refreshMountedUnderlay();
      }
    });
  }
}