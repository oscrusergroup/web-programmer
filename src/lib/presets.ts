import {
  HARDWARE,
  defaultSelection,
  validOptionValue,
  type ConfigOption,
  type Selection,
} from "./config";

export type PresetData = {
  name: string;
  description: string;
  // Raw values, including keys the current firmware may not know about.
  values: Selection;
};
export type Preset = PresetData & { id: string; builtIn: boolean };

export const PRESET_FORMAT = "oscr-preset";
export const PRESET_STORAGE_KEY = "oscr-presets";
const MAX_FILE_LENGTH = 32_768;

// Applies preset values over the schema's defaults. Unknown or invalid values
// are skipped so presets keep working across firmware versions.
export function applyPreset(
  schema: ConfigOption[],
  preset: Selection,
): { values: Selection; skipped: number } {
  const values = defaultSelection(schema),
    options = new Map(schema.map((o) => [o.key, o]));
  let skipped = 0;
  for (const [key, value] of Object.entries(preset)) {
    const option = options.get(key);
    if (option && validOptionValue(option, value)) values[key] = value;
    else skipped++;
  }
  return { values: repairExclusivity(values, schema), skipped };
}

// Moves a preset and the user's unsaved tweaks to another firmware schema.
export function rebasePreset(
  from: ConfigOption[],
  to: ConfigOption[],
  preset: Selection,
  current: Selection,
): Selection {
  const expected = applyPreset(from, preset).values;
  const tweaks = Object.entries(current).filter(([k, v]) => expected[k] !== v);
  return applyPreset(to, { ...preset, ...Object.fromEntries(tweaks) }).values;
}

function repairExclusivity(values: Selection, schema: ConfigOption[]): Selection {
  const defaults = defaultSelection(schema);
  const hardware = HARDWARE.filter((k) => values[k] === true);
  if (hardware.length > 1)
    for (const k of hardware.slice(1)) values[k] = false;
  if (!hardware.length)
    for (const k of HARDWARE) if (k in defaults) values[k] = defaults[k];
  if (values.DS3231 === true && values.DS1307 === true) values.DS1307 = false;
  if ("ENABLE_ROTARY_NEW_OSCR" in values && !values.HW4 && !values.HW5)
    values.ENABLE_ROTARY_NEW_OSCR = false;
  return values;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

export function readPreset(input: unknown): PresetData {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("This file is not an OSCR preset.");
  const file = input as Record<string, unknown>;
  if (file.format !== PRESET_FORMAT) throw new Error("This file is not an OSCR preset.");
  if (file.version !== 1)
    throw new Error("This preset was made by a newer version of the programmer.");
  const name = typeof file.name === "string" ? file.name.trim() : "";
  if (!name) throw new Error("The preset has no name.");
  if (file.description !== undefined && typeof file.description !== "string")
    throw new Error("The preset description must be text.");
  const values = file.values;
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("The preset has no settings.");
  for (const value of Object.values(values))
    if (typeof value !== "boolean" && typeof value !== "string")
      throw new Error("The preset contains an invalid setting.");
  return {
    name: name.slice(0, 80),
    description: ((file.description as string | undefined) ?? "").trim().slice(0, 500),
    values: values as Selection,
  };
}

export function parsePresetFile(text: string): PresetData {
  if (text.length > MAX_FILE_LENGTH) throw new Error("This preset file is too large.");
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new Error("This file is not valid JSON."); }
  return readPreset(input);
}

export function presetFile(
  preset: PresetData,
  firmware: { version: string; revision: string },
): string {
  return `${JSON.stringify({
    format: PRESET_FORMAT,
    version: 1,
    name: preset.name,
    description: preset.description,
    firmware,
    values: preset.values,
  }, null, 2)}\n`;
}

export function presetFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "preset"}.json`;
}

export function uniqueName(name: string, taken: string[]): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  let n = 2;
  while (names.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

// Returns null when storage is blocked by browser privacy settings.
export function loadUserPresets(): Preset[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry) => {
      try {
        if (typeof entry?.id !== "string") return [];
        return [{ ...readPreset({ ...entry, format: PRESET_FORMAT, version: 1 }), id: entry.id, builtIn: false }];
      } catch { return []; }
    });
  } catch (error) {
    return error instanceof SyntaxError ? [] : null;
  }
}

export function saveUserPresets(presets: Preset[]): boolean {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(
      presets.map(({ id, name, description, values }) => ({ id, name, description, values })),
    ));
    return true;
  } catch { return false; }
}
