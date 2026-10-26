// module/item/item-data.mjs

function commonItemSchema() {
  return {
    price: new SchemaField({
      grzywna: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      skojec: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      grosz: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      kwartnik: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      cwiercgrosz: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      denar: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      obol: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),

      total: new NumberField({
        initial: 0,
        min: 0,
        integer: true,
      }),
    }),

    weight: new StringField({
      initial: "Ś",
      choices: ["M", "Ś", "D", "W"],
    }),

    durability: new SchemaField({
      value: new NumberField({
        initial: 1,
        min: 0,
      }),

      max: new NumberField({
        initial: 1,
        min: 0,
      }),
    }),

    description: new StringField({
      initial: "",
    }),
  };
}

function migrateCommonItemData(source) {
  delete source.price?.floren;
  delete source.hands;
  return source;
}

const { TypeDataModel } = foundry.abstract;
const { SchemaField, NumberField, StringField, BooleanField, ArrayField } =
  foundry.data.fields;

export class CRPWeaponData extends TypeDataModel {
  static migrateData(source) {
    migrateCommonItemData(source);
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      ...commonItemSchema(),

      // MECHANIKA
      // damage: new NumberField({ initial: 1, min: 0 }),

      skill: new StringField({ initial: "oneHanded" }),
      // KLUCZ: musi matchować config.skills

      range: new StringField({ initial: "melee" }), // melee / ranged

      // TAGI SYSTEMOWE
      equipped: new BooleanField({ initial: false }),
    };
  }
}

export class CRPArmorData extends TypeDataModel {
  static migrateData(source) {
    migrateCommonItemData(source);
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      ...commonItemSchema(),
      protection: new NumberField({ initial: 0 }),
    };
  }
}

export class CRPShieldData extends TypeDataModel {
  static migrateData(source) {
    migrateCommonItemData(source);
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      ...commonItemSchema(),
      protection: new NumberField({ initial: 0 }),
    };
  }
}

export class CRPStuffData extends TypeDataModel {
  static migrateData(source) {
    migrateCommonItemData(source);
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      ...commonItemSchema(),
    };
  }
}

export class CRPLanguageData extends TypeDataModel {
  static migrateData(source) {
    if (Object.hasOwn(source, "role") && !source.role) {
      source.role = "unassigned";
    }
    if (
      Object.hasOwn(source, "alphabet") &&
      !["latin", "cyrillic", "arabic", "none"].includes(source.alphabet)
    ) {
      source.alphabet = "none";
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      alphabet: new StringField({
        initial: "none",
        choices: ["latin", "cyrillic", "arabic", "none"],
      }),
      description: new StringField({ initial: "" }),
      role: new StringField({
        initial: "unassigned",
        choices: {
          unassigned: "CRP.role.unassigned",
          native: "CRP.role.native",
          foreign: "CRP.role.foreign",
        },
        require: true,
      }),
    };
  }
}

export class CRPOriginData extends TypeDataModel {
  static migrateData(source) {
    if (Object.hasOwn(source, "bonusAttribute") && !source.bonusAttribute) {
      source.bonusAttribute = "strength";
    }
    if (Object.hasOwn(source, "language") && !source.language) {
      source.language = "none";
    }
    if (Object.hasOwn(source, "skills") && !Array.isArray(source.skills)) {
      source.skills = [];
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      bonusAttribute: new StringField({
        initial: "strength",
        choices: ["strength", "agility", "perception", "character", "reason"],
      }),
      skills: new ArrayField(
        new SchemaField({
          key: new StringField(),
          level: new NumberField({
            initial: 1,
            min: 1,
            max: 3,
            integer: true,
          }),
        }),
        { initial: [] },
      ),
      language: new StringField({ initial: "none" }),
      description: new StringField({ initial: "" }),
    };
  }
}

export class CRPTraitData extends TypeDataModel {
  static migrateData(source) {
    if (
      Object.hasOwn(source, "category") &&
      !["advantage", "flaw"].includes(source.category)
    ) {
      source.category = "advantage";
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      category: new StringField({
        initial: "advantage",
        choices: ["advantage", "flaw"],
      }),
      description: new StringField({ initial: "" }),
    };
  }
}
