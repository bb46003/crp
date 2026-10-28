const CRP_MOUNT_UNDERLAY = "systems/crp/assets/wierzchowiec.webp";

export class CRPToken extends foundry.canvas.placeables.Token {
  static UNDERLAY_NAME = "crp-mounted-underlay";
  static UNDERLAY_SCALE = 1.45;

  static UNDERLAY_TEXTURE = null;

  /** @type {PIXI.Sprite | null} */
  _crpMountUnderlay = null;

  /** @type {Promise<void> | null} */
  _crpMountUnderlayPromise = null;

  /**
   * Return the cached mounted underlay texture.
   * @returns {Promise<PIXI.Texture>}
   */
  static getUnderlayTexture() {
    this.UNDERLAY_TEXTURE ??= foundry.canvas.loadTexture(CRP_MOUNT_UNDERLAY);
    return this.UNDERLAY_TEXTURE;
  }

  /**
   * Whether this token's actor is mounted.
   * @returns {boolean}
   */
  isMounted() {
    return this.actor?.system?.equipment?.mounted === true;
  }

  /**
   * Remove the mounted underlay sprite.
   */
  removeMountedUnderlay() {
    const sprite = this._crpMountUnderlay;
    this._crpMountUnderlay = null;

    if (sprite && !sprite.destroyed) {
      sprite.removeFromParent();
      sprite.destroy({ children: true });
    }
  }

  /**
   * Create or refresh the mounted underlay.
   */
  async refreshMountedUnderlay() {
    if (!this.isMounted()) {
      this.removeMountedUnderlay();
      return;
    }

    if (!canvas?.ready || !this.mesh?.parent || this.destroyed) return;

    // Prevent concurrent calls from creating duplicate sprites.
    if (this._crpMountUnderlayPromise) {
      await this._crpMountUnderlayPromise;

      if (!this.isMounted() || this.destroyed) {
        this.removeMountedUnderlay();
        return;
      }

      if (this._crpMountUnderlay && !this._crpMountUnderlay.destroyed) {
        this._refreshMountedUnderlayPosition();
        this._refreshMountedUnderlayAppearance();
        return;
      }
    }

    let sprite = this._crpMountUnderlay;

    if (!sprite || sprite.destroyed) {
      this._crpMountUnderlayPromise = (async () => {
        const texture = await CRPToken.getUnderlayTexture();

        // The token or mounted state may have changed while loading.
        if (this.destroyed || !this.isMounted() || !canvas?.ready || !this.mesh?.parent) {
          return;
        }

        // Another call may already have created the sprite.
        if (this._crpMountUnderlay && !this._crpMountUnderlay.destroyed) {
          return;
        }

        sprite = PIXI.Sprite.from(texture);
        sprite.name = CRPToken.UNDERLAY_NAME;
        sprite.eventMode = "none";
        sprite.interactive = false;

        this._crpMountUnderlay = sprite;

        // Clean up any orphaned underlays left by previous renders.
        for (const child of this.mesh.parent.children) {
          if (child.name === CRPToken.UNDERLAY_NAME && child !== sprite) {
            child.removeFromParent();
            child.destroy({ children: true });
          }
        }

        this._refreshMountedUnderlayPosition();
        this._refreshMountedUnderlayAppearance();
      })();

      try {
        await this._crpMountUnderlayPromise;
      } catch (error) {
        console.error("CRP | Failed to create mounted underlay", error);
        this.removeMountedUnderlay();
      } finally {
        this._crpMountUnderlayPromise = null;
      }
    } else {
      this._refreshMountedUnderlayPosition();
      this._refreshMountedUnderlayAppearance();
    }
  }

  /**
   * Position the underlay immediately behind the token mesh.
   */
  _refreshMountedUnderlayPosition() {
    const sprite = this._crpMountUnderlay;
    const mesh = this.mesh;

    if (!sprite || sprite.destroyed || !mesh?.parent || this.destroyed) return;

    const parent = mesh.parent;

    // Ensure the sprite and mesh belong to the same container.
    if (sprite.parent !== parent) {
      sprite.removeFromParent();
      parent.addChild(sprite);
    }

    // Match the token's local position.
    sprite.position.copyFrom(mesh.position);

    // Remove the sprite first, then insert it immediately before the mesh.
    // This avoids index-shift errors when the sprite is already in the container.
    sprite.removeFromParent();

    const meshIndex = parent.getChildIndex(mesh);
    parent.addChildAt(sprite, meshIndex);
  }

  /**
   * Synchronize the underlay's size, rotation, opacity and visibility.
   */
  _refreshMountedUnderlayAppearance() {
    const sprite = this._crpMountUnderlay;
    const mesh = this.mesh;

    if (!sprite || sprite.destroyed || !mesh || this.destroyed) return;

    const { width, height } = this.document.getSize();

    sprite.anchor.set(0.5);
    sprite.width = width * CRPToken.UNDERLAY_SCALE;
    sprite.height = height * CRPToken.UNDERLAY_SCALE;

    sprite.angle = this.document.rotation ?? 0;
    sprite.alpha = this.document.alpha ?? 1;
    sprite.visible = mesh.visible !== false;
  }

  /**
   * Foundry calls refresh when the token needs its visual state updated.
   */
  refresh(...args) {
    super.refresh(...args);

    if (this.isMounted()) {
      void this.refreshMountedUnderlay();
    } else {
      this.removeMountedUnderlay();
    }
  }

  /**
   * Remove the underlay when Foundry destroys this token object.
   */
  _destroy(options) {
    this.removeMountedUnderlay();
    return super._destroy(options);
  }

  /**
   * Get all active and currently rendered tokens belonging to an actor.
   * @param {Actor} actor
   * @returns {Token[]}
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
   * Refresh underlays for every token belonging to an actor.
   * @param {Actor} actor
   */
  static refreshMountedActorUnderlays(actor) {
    for (const token of this.getMountedActorTokens(actor)) {
      if (token instanceof CRPToken) {
        void token.refreshMountedUnderlay();
      }
    }
  }

  /**
   * Detect changes to the mounted property in Foundry update data.
   * Supports flattened and nested update objects.
   * @param {object} changed
   * @returns {boolean}
   */
  static hasMountedStateChanged(changed) {
    const paths = [
      "actorData.system.equipment.mounted",
      "delta.system.equipment.mounted",
      "system.equipment.mounted",
    ];

    return paths.some((path) => {
      if (Object.hasOwn(changed ?? {}, path)) return true;
      return foundry.utils.getProperty(changed, path) !== undefined;
    });
  }

  /**
   * Register the hooks required by the mounted underlay.
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
      if (!(token instanceof CRPToken)) return;

      if (token.isMounted()) {
        token._refreshMountedUnderlayPosition();
        token._refreshMountedUnderlayAppearance();
        void token.refreshMountedUnderlay();
      } else {
        token.removeMountedUnderlay();
      }
    });

    Hooks.on("deleteToken", (tokenDocument) => {
      const token = canvas.tokens?.get(tokenDocument.id);
      if (token instanceof CRPToken) {
        token.removeMountedUnderlay();
      }
    });

    Hooks.on("crpMountedChanged", (actor) => {
      CRPToken.refreshMountedActorUnderlays(actor);
    });

    Hooks.on("updateToken", (tokenDocument) => {
      const token = canvas.tokens?.get(tokenDocument.id);

      if (token instanceof CRPToken) {
        void token.refreshMountedUnderlay();
      }
    });
  }
}