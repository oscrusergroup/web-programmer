export type Selection = Record<string, boolean | string>;
export type ConfigOption = {
  key: string;
  label: string;
  description: string;
  section: string;
  enabled: boolean;
  value: string;
  kind: "boolean" | "rgb" | "save-type";
  line: number;
};
export const HARDWARE = ["HW5", "HW4", "HW3", "HW2", "HW1", "SERIAL_MONITOR"];
export const CORE_SECTION = "GAME SYSTEM CORES";
const labels: Record<string, string> = {
  SERIAL_MONITOR: "Serial monitor",
  ENABLE_CONTROLLERTEST: "N64 controller test",
  ENABLE_FLASH8: "8-bit flash programmer",
  ENABLE_FLASH16: "16-bit flash programmer",
  ENABLE_ROTARY_NEW_OSCR: "New OSCR rotary display",
  DS3231: "DS3231",
  DS1307: "DS1307",
  OPTION_CLOCKGEN_CALIBRATION: "Clock calibration menu",
  OPTION_CLOCKGEN_USE_CALIBRATION: "Use saved clock calibration",
  use_md_conf: "Legacy Mega Drive configuration",
  OPTION_MD_DEFAULT_SAVE_TYPE: "Mega Drive save format",
};

export function parseConfig(source: string): ConfigOption[] {
  // Mask block comments first: their examples contain convincing #define lines.
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\r\n]/g, " "))
    .split(/\r?\n/);
  let section = "",
    label = "",
    description: string[] = [],
    collecting = false;
  const options: ConfigOption[] = [];
  for (const [line, raw] of source.split(/\r?\n/).entries()) {
    const heading = raw.match(/\/\*====\s+(.+?)\s*=+\*\//);
    if (heading) {
      section = heading[1];
      label = "";
      description = [];
      if (section === "PROCESSING") break;
    }
    const title = raw.match(/\/\*\s*\[\s*(.*?)\s*-+\s*\]/);
    if (title) {
      label = title[1];
      description = [];
      collecting = true;
      continue;
    }
    if (collecting) {
      if (raw.includes("*/")) collecting = false;
      else if (raw.trim()) description.push(raw.trim());
    }
    const define = executable[line]?.match(
      /^\s*(\/\/\s*)?#define\s+(\w+)(?:[ \t]+(.*?))?\s*$/,
    );
    if (!define || !section) continue;
    const key = define[2],
      value = define[3]?.trim() ?? "";
    options.push({
      key,
      label: labels[key] ?? (HARDWARE.includes(key) ? key : label || key),
      description: description.join(" "),
      section,
      enabled: !define[1],
      value,
      kind:
        key === "OPTION_LCD_BG_COLOR"
          ? "rgb"
          : key === "OPTION_MD_DEFAULT_SAVE_TYPE"
            ? "save-type"
            : "boolean",
      line,
    });
  }
  return options;
}

export function defaultSelection(schema: ConfigOption[]): Selection {
  return Object.fromEntries(
    schema.map((o) => [
      o.key,
      o.kind === "boolean" ? o.enabled : o.enabled ? o.value : false,
    ]),
  );
}

export function validOptionValue(o: ConfigOption, v: unknown): boolean {
  if (o.kind === "boolean") return typeof v === "boolean";
  if (o.kind === "rgb")
    return (
      typeof v === "string" &&
      /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) &&
      !v.split(",").some((n) => Number(n) > 255)
    );
  return v === false || ["0", "1", "2"].includes(v as string);
}

export function validateSelection(
  schema: ConfigOption[],
  input: unknown,
): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return ["Configuration must be an object."];
  const values = input as Selection,
    errors: string[] = [];
  const allowed = new Set(schema.map((o) => o.key));
  for (const key of Object.keys(values))
    if (!allowed.has(key)) errors.push(`Unknown option: ${key}`);
  for (const o of schema) {
    if (validOptionValue(o, values[o.key])) continue;
    if (o.kind === "boolean") errors.push(`${o.key} must be a boolean.`);
    if (o.kind === "rgb")
      errors.push(
        "LCD color must contain three values from 0 to 255 (green, red, blue).",
      );
    if (o.kind === "save-type")
      errors.push("Mega Drive save format must be disabled, 0, 1 or 2.");
  }
  if (HARDWARE.filter((k) => values[k] === true).length !== 1)
    errors.push("Choose exactly one hardware revision.");
  if (
    values.ENABLE_RTC &&
    [values.DS3231, values.DS1307].filter(Boolean).length !== 1
  )
    errors.push("Choose exactly one RTC chip.");
  if (values.ENABLE_VSELECT && !values.HW3 && !values.HW5)
    errors.push(
      "VSELECT is supported only on HW3 and HW5 by this firmware's safe configuration.",
    );
  if (values.ENABLE_ROTARY_NEW_OSCR && !values.HW4 && !values.HW5)
    errors.push("The new OSCR rotary display is supported only on HW4 and HW5.");
  if (values.SERIAL_MONITOR && values.ENABLE_3V3FIX)
    errors.push(
      "The 3.3V stability fix cannot be used with serial monitor hardware.",
    );
  const requires: Record<string, string[]> = {
    ENABLE_SFM: ["ENABLE_SNES"],
    ENABLE_SV: ["ENABLE_SNES"],
    ENABLE_ST: ["ENABLE_SNES"],
    ENABLE_GPC: ["ENABLE_SNES"],
    ENABLE_CONTROLLERTEST: ["ENABLE_N64"],
    ENABLE_CPS3: ["ENABLE_FLASH8", "ENABLE_FLASH16"],
    ENABLE_FLASH16: ["ENABLE_FLASH8"],
    OPTION_CLOCKGEN_CALIBRATION: ["ENABLE_CLOCKGEN", "ENABLE_SNES"],
    OPTION_CLOCKGEN_USE_CALIBRATION: ["ENABLE_CLOCKGEN", "ENABLE_SNES"],
  };
  for (const [key, deps] of Object.entries(requires))
    if (values[key])
      for (const dep of deps)
        if (!values[dep]) errors.push(`${key} requires ${dep}.`);
  return errors;
}

export function configurationWarnings(values: Selection): string[] {
  const warnings: string[] = [];
  if (values.ENABLE_UPDATER && !values.HW3 && !values.HW5)
    warnings.push("The firmware updater is only active on HW3 and HW5.");
  if (values.ENABLE_3V3FIX && !values.ENABLE_VSELECT)
    warnings.push(
      "With the 3.3V fix, power on at 5V and switch to 5V before selecting a cartridge.",
    );
  if (values.ENABLE_CONFIG && values.OPTION_MD_DEFAULT_SAVE_TYPE !== false)
    warnings.push(
      "The SD configuration file overrides the selected Mega Drive save format.",
    );
  return warnings;
}

export function generateConfig(
  source: string,
  schema: ConfigOption[],
  values: Selection,
): string {
  const errors = validateSelection(schema, values);
  if (errors.length) throw new Error(errors.join("\n"));
  const lines = source.split("\n");
  for (const option of schema) {
    const v = values[option.key],
      suffix = lines[option.line].endsWith("\r") ? "\r" : "";
    const enabled = v !== false;
    const value =
      option.kind === "boolean"
        ? option.value
        : enabled
          ? String(v)
          : option.value;
    lines[option.line] =
      `${enabled ? "" : "//"}#define ${option.key}${value ? ` ${value}` : ""}${suffix}`;
  }
  return lines.join("\n");
}
