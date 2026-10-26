// module/item/item.mjs

function migrateLegacyExportSource(source) {
  if (!source || typeof source !== "object") return;

  const flags = source.flags;
  if (
    !flags ||
    typeof flags !== "object" ||
    !Object.hasOwn(flags, "exportSource")
  )
    return;

  const legacyExportSource = Object.getOwnPropertyDescriptor(
    flags,
    "exportSource",
  )?.value;

  source._stats ??= {};
  if (legacyExportSource && !Object.hasOwn(source._stats, "exportSource")) {
    source._stats.exportSource = {
      worldId: legacyExportSource.world ?? legacyExportSource.worldId ?? null,
      uuid: legacyExportSource.uuid ?? null,
      coreVersion: legacyExportSource.coreVersion ?? null,
      systemId:
        legacyExportSource.system ?? legacyExportSource.systemId ?? null,
      systemVersion: legacyExportSource.systemVersion ?? null,
    };
  }

  delete flags.exportSource;
}

export class CRPItem extends Item {
  static migrateData(source) {
    migrateLegacyExportSource(source);

    if (source.type === "flaw") {
      source.type = "trait";
      source.system ??= {};
      source.system.category ??= "flaw";
    }

    return super.migrateData(source);
  }
}
