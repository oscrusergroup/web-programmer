"use client";
import {
  Check,
  Search,
  SlidersHorizontal,
  Cpu,
  CircuitBoard,
} from "lucide-react";
import { useState } from "react";
import {
  HARDWARE,
  CORE_SECTION,
  type ConfigOption,
  type Selection,
} from "@/lib/config";

type Props = {
  schema: ConfigOption[];
  values: Selection;
  onChange: (key: string, value: boolean | string) => void;
  disabled: boolean;
};
const hardwareInfo: Record<string, string> = {
  HW5: "LCD display · rotary encoder",
  HW4: "LCD display · rotary encoder",
  HW3: "OLED display · two buttons",
  HW2: "OLED display · two buttons",
  HW1: "OLED display · one button",
  SERIAL_MONITOR: "Control through a serial terminal",
};
export function Toggle({
  option,
  value,
  onChange,
  disabled,
}: {
  option: ConfigOption;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 py-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{option.label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted">
          {option.description || option.key}
        </span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          className="peer sr-only"
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={option.label}
        />
        <span className="h-[22px] w-10 rounded-full bg-line peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent peer-disabled:opacity-50" />
        <span className="absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}
export function HardwareFields({ schema, values, onChange, disabled }: Props) {
  return (
    <div className="soft-enter">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Meet your hardware
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Choose the revision printed on your cartridge reader’s PCB.
        </p>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Hardware revision</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {HARDWARE.map((key) => (
            <label
              key={key}
              className={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${values[key] ? "border-accent bg-selected ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
            >
              <input
                type="radio"
                name="hardware"
                value={key}
                checked={values[key] === true}
                onChange={() => onChange(key, true)}
                className="sr-only peer"
              />
              <span className="rounded-lg bg-surface p-2 text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <CircuitBoard size={23} strokeWidth={1.5} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">
                  {key === "SERIAL_MONITOR"
                    ? "Serial monitor"
                    : `Hardware ${key.slice(2)}`}
                </span>
                <span className="mt-1 block text-[11px] leading-5 text-muted">
                  {hardwareInfo[key]}
                </span>
              </span>
              <span
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${values[key] ? "border-accent bg-brand" : "border-line-strong"}`}
              >
                {values[key] && (
                  <Check size={10} color="white" strokeWidth={3} />
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-8 border-t border-line-soft pt-6">
        <div className="mb-1 flex items-center gap-2">
          <Cpu size={17} className="text-muted" />
          <h3 className="text-sm font-semibold">Installed modules</h3>
        </div>
        <p className="text-xs text-muted">
          Enable only the modules fitted to your reader.
        </p>
        <div className="mt-3 divide-y divide-line-soft">
          {schema
            .filter((o) => o.section === "HARDWARE MODULES")
            .map((o) => (
              <Toggle
                key={o.key}
                option={o}
                value={!!values[o.key]}
                disabled={disabled}
                onChange={(v) => onChange(o.key, v)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
export function CoreFields({ schema, values, onChange, disabled }: Props) {
  const [query, setQuery] = useState(""),
    [selectedOnly, setSelectedOnly] = useState(false);
  const cores = schema.filter((o) => o.section === CORE_SECTION);
  const filtered = cores.filter(
    (o) =>
      (!selectedOnly || values[o.key]) &&
      `${o.label} ${o.key}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="soft-enter">
      <h2 className="text-xl font-semibold tracking-tight">
        Choose your game systems
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Include the systems you use. Fewer cores leave more room in flash
        memory.
      </p>
      <div className="mt-6 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute top-3 left-3 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search game systems…"
            aria-label="Search game systems"
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-3 pl-9 text-sm"
          />
        </div>
        <button
          aria-label="Show selected systems"
          onClick={() => setSelectedOnly(!selectedOnly)}
          className={`button-secondary ${selectedOnly ? "border-accent! text-accent" : ""}`}
          aria-pressed={selectedOnly}
        >
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">Selected</span>
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {filtered.map((o) => (
          <label
            key={o.key}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${values[o.key] ? "border-selected-border bg-selected" : "border-line"}`}
          >
            <input
              type="checkbox"
              checked={!!values[o.key]}
              onChange={(e) => onChange(o.key, e.target.checked)}
              disabled={disabled}
              className="h-4 w-4 shrink-0"
            />
            <span className="text-xs leading-5 font-medium">{o.label}</span>
          </label>
        ))}
      </div>
      {!filtered.length && (
        <p className="py-10 text-center text-sm text-muted">
          No systems match this filter.
        </p>
      )}
      <p className="mt-5 text-xs leading-relaxed text-muted">
        SNES add-ons require the Super Nintendo core. CPS3 requires both flash
        programmer cores. Dependencies are checked before building.
      </p>
    </div>
  );
}
export function OptionFields({ schema, values, onChange, disabled }: Props) {
  const rgb = String(values.OPTION_LCD_BG_COLOR)
    .split(",")
    .map((v) => v.trim());
  return (
    <div className="soft-enter">
      <h2 className="text-xl font-semibold tracking-tight">Make it your own</h2>
      <p className="mt-2 text-sm text-muted">
        Fine-tune the features included in your firmware.
      </p>
      <div className="mt-6 rounded-xl bg-surface-soft p-4">
        <h3 className="text-sm font-semibold">LCD backlight</h3>
        <p className="mt-1 text-xs text-muted">
          Color channels from 0 to 255. Used by LCD hardware.
        </p>
        <div className="mt-3 flex gap-3">
          {["Green", "Red", "Blue"].map((label, i) => (
            <label key={label} className="min-w-0 flex-1 text-xs text-muted">
              {label}
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[i] ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...rgb];
                  next[i] = e.target.value;
                  onChange("OPTION_LCD_BG_COLOR", next.join(", "));
                }}
                className="mt-1 block w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          RTC chip
          <select
            value={values.DS1307 ? "DS1307" : "DS3231"}
            disabled={disabled || !values.ENABLE_RTC}
            onChange={(e) => onChange(e.target.value, true)}
            className="mt-2 block w-full rounded-lg border border-line bg-surface p-2.5 text-sm disabled:opacity-50"
          >
            <option>DS3231</option>
            <option>DS1307</option>
          </select>
          <span className="mt-1 block font-normal text-muted">
            Requires the RTC module.
          </span>
        </label>
        <label className="text-xs font-semibold">
          Mega Drive save format
          <select
            value={
              values.OPTION_MD_DEFAULT_SAVE_TYPE === false
                ? "off"
                : String(values.OPTION_MD_DEFAULT_SAVE_TYPE)
            }
            disabled={disabled}
            onChange={(e) =>
              onChange(
                "OPTION_MD_DEFAULT_SAVE_TYPE",
                e.target.value === "off" ? false : e.target.value,
              )
            }
            className="mt-2 block w-full rounded-lg border border-line bg-surface p-2.5 text-sm"
          >
            <option value="off">Firmware default</option>
            <option value="0">Raw bytes</option>
            <option value="1">Kega Fusion</option>
            <option value="2">Kega Fusion · 64 KB</option>
          </select>
        </label>
      </div>
      <div className="mt-5 divide-y divide-line-soft">
        {schema
          .filter(
            (o) =>
              o.section === "FIRMWARE OPTIONS" &&
              o.kind === "boolean" &&
              !["DS3231", "DS1307"].includes(o.key),
          )
          .map((o) => (
            <Toggle
              key={o.key}
              option={o}
              value={!!values[o.key]}
              onChange={(v) => onChange(o.key, v)}
              disabled={disabled}
            />
          ))}
      </div>
    </div>
  );
}
