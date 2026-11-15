/**
 * Versioned save document (MASTER_PROMPT 4.3 rule 7). Phase 0 only stores a
 * launch counter, which proves storage survives an APK update.
 */
export const SAVE_KEY = 'turfbreak.save';
export const SAVE_VERSION = 1;

export interface SaveV1 {
  version: 1;
  launches: number;
}

export type Save = SaveV1;

export function defaultSave(): Save {
  return { version: SAVE_VERSION, launches: 0 };
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n document to version n + 1. Append, never edit. */
const migrations: Record<number, Migration> = {};

function isSaveV1(doc: Record<string, unknown>): doc is Record<string, unknown> & SaveV1 {
  return doc.version === 1 && typeof doc.launches === 'number' && Number.isFinite(doc.launches);
}

/** Parse a stored save. Anything unreadable falls back to a fresh save; it never throws. */
export function parseSave(raw: string | null): Save {
  if (raw === null) return defaultSave();
  try {
    const doc: unknown = JSON.parse(raw);
    if (typeof doc !== 'object' || doc === null) return defaultSave();
    let record = doc as Record<string, unknown>;
    let version = typeof record.version === 'number' ? record.version : 0;
    while (version < SAVE_VERSION) {
      const migrate = migrations[version];
      if (!migrate) return defaultSave();
      record = migrate(record);
      version++;
    }
    return isSaveV1(record) ? { version: 1, launches: record.launches } : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save);
}
