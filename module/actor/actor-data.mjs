// module/actor/actor-data.mjs

const { TypeDataModel } = foundry.abstract;
const { 
  SchemaField, 
  NumberField,
  StringField,
  BooleanField,
  HTMLField,
  ArrayField
} = foundry.data.fields;

export class CRPActorData extends TypeDataModel {
  static migrateData(source) {
    delete source.money?.floren;

    if (typeof source.derived?.maneuver === "number") {
      const maneuver = source.derived.maneuver;
      source.derived.maneuver = {
        value: maneuver,
        max: maneuver
      };
    }

    if (
      source.attributes &&
      source.resources &&
      !Object.hasOwn(source.resources, "advantageUses")
    ) {
      source.resources.advantageUses = {
        value: source.attributes.reason?.value ?? 4
      };
    }

    return super.migrateData(source);
  }

  static defineSchema() {
    return {

      // ATRYBUTY + SKILLE
      attributes: new SchemaField({
        strength: new SchemaField({
          value: new NumberField({ initial: 3, min: 0, max: 10 }),
          skills: new SchemaField({
            twoHanded: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            endurance: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            shield: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            brawl: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            intimidate: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) })
          })
        }),

        agility: new SchemaField({
          value: new NumberField({ initial: 3, min: 0, max: 10 }),
          skills: new SchemaField({
            athletics: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            oneHanded: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            lightWeapons: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            craft: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            stealth: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) })
          })
        }),

        perception: new SchemaField({
          value: new NumberField({ initial: 3, min: 0, max: 10 }),
          skills: new SchemaField({
            empathy: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            disguise: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            survival: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            awareness: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            ranged: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) })
          })
        }),

        character: new SchemaField({
          value: new NumberField({ initial: 3, min: 0, max: 10 }),
          skills: new SchemaField({
            charisma: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            animals: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            carousing: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            gossip: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            willpower: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) })
          })
        }),

        reason: new SchemaField({
          value: new NumberField({ initial: 3, min: 0, max: 10 }),
          skills: new SchemaField({
            literacy: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            languages: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            medicine: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            politics: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) }),
            knowledge: new SchemaField({ value: new NumberField({ initial: 0, min: 0, max: 10 }) })
          })
        })
      }),

      // WSPÓŁCZYNNIKI POCHODNE
      derived: new SchemaField({
        initiative: new NumberField({ initial: 0 }),
        initiativeWeaponModifier: new NumberField({ initial: 0 }),
        initiativeArmorModifier: new NumberField({ initial: 0 }),
        initiativeTotal: new NumberField({ initial: 0 }),

        health: new SchemaField({
          value: new NumberField({ initial: 8 }),
          max: new NumberField({ initial: 8, min: 1 })
        }),

        maneuver: new SchemaField({
          value: new NumberField({ initial: 0, min: 0 }),
          max: new NumberField({ initial: 0, min: 0 })
        }),
        woundState: new StringField({
          initial: "healthy"
        })
      }),

      npc: new SchemaField({
        attributes: new NumberField({ initial: 8, min: 0, integer: true }),
        protection: new NumberField({ initial: 0, min: 0, integer: true })
      }),

      // ZASOBY
      resources: new SchemaField({
        fate: new SchemaField({
          value: new NumberField({ initial: 2, min: 0 }),
          max: new NumberField({ initial: 2, min: 2 })
        }),
        experience: new SchemaField({
          value: new NumberField({ initial: 0, min: 0 }),
          free: new NumberField({ initial: 0, min: 0 }),
          log: new ArrayField(new SchemaField({
            date: new StringField(),
            text: new StringField()
          }), { initial: [] })
        }),
        advantageUses: new SchemaField({
          value: new NumberField({
            initial: 4,
            min: 0,
            integer: true
          })
        })
      }),

      // WALUTA
money: new SchemaField({

  grzywna: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  skojec: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  grosz: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  kwartnik: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  cwiercgrosz: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  denar: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  obol: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  }),

  // Łączna wartość w obolach (cache/helper)
  total: new NumberField({
    initial: 0,
    min: 0,
    integer: true
  })
}),



      // STANY
      state: new SchemaField({
        life: new StringField({
          initial: "alive",
          choices: ["alive", "dead"]
        }),
        bleeding: new BooleanField({ initial: false }),
        unconscious: new BooleanField({ initial: false })
      }),

      equipment: new SchemaField({
  rightHand: new SchemaField({
    id: new StringField({ nullable: true }),
    name: new StringField({ nullable: true }),
    img: new StringField({ nullable: true })
  }),

  leftHand: new SchemaField({
    id: new StringField({ nullable: true }),
    name: new StringField({ nullable: true }),
    img: new StringField({ nullable: true })
  }),

  armor: new SchemaField({
    id: new StringField({ nullable: true }),
    name: new StringField({ nullable: true }),
    img: new StringField({ nullable: true })
  }),

  mounted: new BooleanField({ initial: false })
}),

bio: new SchemaField({
  description: new HTMLField({ initial: "" }),
  origin: new SchemaField({
    id: new StringField({ nullable: true }),
    name: new StringField({ nullable: true }),
    img: new StringField({ nullable: true })
  }),
  crest: new StringField({ initial: "" }),
  crestDescription: new StringField({ initial: "" })
}),

    };


    
  }
  prepareDerivedData() {
    super.prepareDerivedData();
  }

}

export class CRPNPCKnechtData extends CRPActorData {}

export class CRPNPCRycerzData extends CRPActorData {}
