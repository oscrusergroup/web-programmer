"use client";
import {
  Check,
  Search,
  SlidersHorizontal,
  Cpu,
  CircuitBoard,
  Info,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState, type RefObject } from "react";
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
  onInfo,
}: {
  option: ConfigOption;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  onInfo?: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 py-4">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {option.label}
          {onInfo && (
            <button
              type="button"
              aria-label={`More about ${option.label}`}
              title={`More about ${option.label}`}
              // preventDefault keeps the surrounding label from toggling the switch.
              onClick={(e) => { e.preventDefault(); onInfo(); }}
              className="rounded-full text-muted hover:text-accent"
            >
              <Info size={15} />
            </button>
          )}
        </span>
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
const displayPhotos = [
  {
    src: "/images/display-new-oscr.webp",
    title: "New OSCR rotary display",
    caption: "The OSCR-branded display board is visible to the left of the screen.",
  },
  {
    src: "/images/display-regular.webp",
    title: "Regular display",
    caption: "The display board is hidden behind the case front.",
  },
];
function RotaryDisplayInfo({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      ref={dialog}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(92vw,640px)] rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Which display do you have?</h2>
        <button aria-label="Close" onClick={() => dialog.current?.close()} className="rounded p-1 text-muted">
          <X size={20} />
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        Enable this option only if your HW4 or HW5 reader has the new OSCR-branded rotary display,
        such as the HW5 sold by cartreader.net. Leave it off for the regular display.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        {displayPhotos.map((photo) => (
          <figure key={photo.src}>
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-line">
              <Image src={photo.src} alt={`${photo.title} on a cartreader.net HW5 reader`} fill
                sizes="(min-width: 640px) 300px, 45vw" className="object-cover" />
            </div>
            <figcaption className="mt-2 text-xs leading-5">
              <span className="block font-semibold">{photo.title}</span>
              <span className="text-muted">{photo.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </dialog>
  );
}
export function HardwareFields({ schema, values, onChange, disabled }: Props) {
  const displayInfo = useRef<HTMLDialogElement>(null);
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
            .map((o) => {
              const rotaryOnly =
                o.key === "ENABLE_ROTARY_NEW_OSCR" && !values.HW4 && !values.HW5;
              return (
                <div key={o.key}>
                  <Toggle
                    option={
                      rotaryOnly
                        ? { ...o, description: `${o.description} Requires HW4 or HW5.` }
                        : o
                    }
                    value={!!values[o.key]}
                    disabled={disabled || rotaryOnly}
                    onChange={(v) => onChange(o.key, v)}
                    onInfo={o.key === "ENABLE_ROTARY_NEW_OSCR" ? () => displayInfo.current?.showModal() : undefined}
                  />
                  {o.key === "ENABLE_RTC" && values.ENABLE_RTC && (
                    <label className="block pb-4 text-xs font-semibold sm:w-1/2">
                      RTC chip
                      <select
                        value={values.DS1307 ? "DS1307" : "DS3231"}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value, true)}
                        className="mt-2 block w-full rounded-lg border border-line bg-surface p-2.5 text-sm [--select-inset:0.625rem]"
                      >
                        <option>DS3231</option>
                        <option>DS1307</option>
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      <RotaryDisplayInfo dialog={displayInfo} />
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
  const color = `#${[rgb[1], rgb[0], rgb[2]]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(Number(channel) || 0)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
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
        <label className="mt-3 block text-xs text-muted">
          Backlight color
          <input
            type="color"
            value={color}
            disabled={disabled}
            onChange={(e) => {
              const hex = e.target.value;
              const red = parseInt(hex.slice(1, 3), 16);
              const green = parseInt(hex.slice(3, 5), 16);
              const blue = parseInt(hex.slice(5, 7), 16);
              onChange("OPTION_LCD_BG_COLOR", `${green}, ${red}, ${blue}`);
            }}
            className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-line bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
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
            className="mt-2 block w-full rounded-lg border border-line bg-surface p-2.5 text-sm [--select-inset:0.625rem]"
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
