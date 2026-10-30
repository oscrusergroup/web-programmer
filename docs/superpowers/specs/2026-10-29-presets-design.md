# Configuration presets — design

## Intent

Configuring OSCR firmware means working through dozens of `Config.h` options. Presets let
people start from a known-good configuration instead of building one from scratch:

- **Built-in presets** are curated by the site owner, ship with the website, and can be linked
  to directly (e.g. from a forum post) with `?preset=<id>`.
- **My presets** are a visitor's own saved configurations, kept in their browser and shared
  with other people as `.json` files.

Built-in preset contents will be supplied later by the owner, made with the export feature
this work adds. The first implementation ships the mechanism with no built-ins (or a single
placeholder that is removed before release — builder's call).

## Goals

- Pick a preset and have it fill in the configuration form.
- Save the current configuration as a new preset; update an existing user preset in place.
- Export the current configuration as a `.json` file; import a `.json` file into My presets.
- Link directly to a built-in preset via a query parameter.
- Presets keep working across firmware versions.

## Non-goals

- Presets are **not** tied to a firmware version and never change the selected code version.
- No accounts or server-side storage. My presets live in `localStorage` (per device, lost if
  site data is cleared — accepted).
- User presets do **not** get links. Only built-ins have a query parameter.

## Anti-goals

- A user must never be able to overwrite, rename or delete a built-in preset.
- Importing a file must never silently replace an existing preset.

## What a preset is

A preset has a **name**, a **description** and a set of **values** (`Selection`: option key →
boolean or string, as in `src/lib/config.ts`).

### File format (export / import / built-ins)

```json
{
  "format": "oscr-preset",
  "version": 1,
  "name": "SNES + N64",
  "description": "For HW5 owners who only dump SNES and N64 carts.",
  "firmware": { "version": "15.2", "revision": "<40-char sha>" },
  "values": { "HW5": true, "ENABLE_SNES": true, "...": "..." }
}
```

- `firmware` is informational only: it records what the preset was made on and is never used
  to switch versions.
- Built-in presets use exactly this file format, so the owner's exported file can be dropped
  in as-is. Built-ins live in the repo (suggested: `src/presets/<id>.json`, where `<id>` is the
  query-parameter value, plus an ordered list of ids so the owner controls dropdown order).
- Stored values are kept **raw**, including keys the current firmware doesn't know about, so
  a preset survives being applied to an older or newer firmware and back.

### Applying a preset to a firmware

`applyPreset(schema, presetValues)` → `Selection`:

1. Start from `defaultSelection(schema)`.
2. For each preset key that exists in the schema and whose value is valid for that option's
   kind, use the preset value. New options not in the preset keep their defaults.
3. Preset keys missing from the schema (or with invalid values) are ignored; count them.
4. Repair exclusivity the same way `update()` does in `programmer.tsx` (exactly one hardware
   key; at most one of DS3231/DS1307; rotary display only on HW4/HW5). If the preset has no
   valid hardware key, keep the default hardware.

If anything was ignored, show a short note under the preset dropdown, e.g.
"2 settings in this preset don't exist in this firmware version and were skipped."

This should be a pure function in `src/lib/` with unit tests (in the style of
`tests/config.test.ts`).

## Behaviour

### Selecting

The preset dropdown lists, in groups: **Built-in** presets, then **My presets**, plus a
"Default" entry. Selecting a preset applies it immediately (replacing the current form
values) and shows its description beneath the dropdown. Selecting "Default" restores the
firmware defaults, keeping the chosen hardware (same as "Restore defaults").

### Modified state

Once a preset is applied, if the form values differ from `applyPreset(schema, preset.values)`
the preset shows as **"<Name> (modified)"**. This is derived by comparison, not a sticky flag,
so undoing a change returns it to unmodified.

### Query parameter (built-ins only)

- On page load, `?preset=<id>` matching a built-in applies it.
- An unknown id shows a short "Preset not found" note and leaves defaults in place.
- While a built-in is selected and unmodified, the URL carries `?preset=<id>`
  (use `history.replaceState`, no reload). Selecting a different built-in updates it.
- As soon as the configuration becomes modified, or a user preset / "Default" is selected,
  `?preset=` is removed from the URL.

### Changing firmware version

Today, changing the code version resets the configuration to defaults
(`selectFirmware` in `programmer.tsx`). With a preset active:

- The active preset is reapplied to the new firmware.
- Unsaved tweaks carry over: the new values are the current on-screen values for every key
  that still exists in the new schema, with defaults for new keys (then exclusivity repair).
  Unmodified presets therefore end up identical to a fresh `applyPreset`.
- The "(modified)" state is re-derived against the new firmware.

With no preset active, behaviour is unchanged (reset to defaults). The intro text
"Changing versions resets your configuration…" must be updated to reflect this.

### Saving

- **Save as new** — always available. Prompts for name and description, saves the current
  values to My presets, and selects the new preset.
- **Update preset** — only when a *user* preset is selected and modified. Overwrites that
  preset's values in place. Never offered for built-ins.
- User presets can also be **renamed / description edited** and **deleted** (delete asks for
  confirmation). None of these actions are available for built-ins.

### Export

Exports exactly what is on screen now, as the file format above, downloaded as
`<name>.json`. Name/description come from the selected preset (built-in or user, modified or
not); with no preset selected the name is "Custom configuration" and the description empty.
This is how the owner produces built-in presets: configure, export, hand over the file.

### Import

- Accepts a `.json` file in the format above. Reject with a clear message if it isn't valid
  JSON, isn't `format: "oscr-preset"`, has an unsupported `version`, lacks a name, or has
  values that aren't booleans/strings. Cap file size (the build endpoint caps configuration
  at 16 KB; same order of magnitude is fine).
- The imported preset is added to My presets and selected (applied).
- Name clash with an existing preset (built-in or user): add as "Name (2)", "Name (3)", …
  Never replace.

## Layout

The existing **Firmware source** panel (`programmer.tsx`, `aria-labelledby="firmware-source-heading"`)
becomes two columns on wide screens:

- **Left:** Preset — dropdown, description / notes, and the actions
  (Save as new, Update, Import, Export, Edit, Delete).
- **Right:** the "Firmware source" heading and intro text, with the Code version select
  underneath (existing content, rearranged).

On narrow screens they stack with **firmware first, presets second**. Use the existing
`panel` styling and form-control classes in that file; icons from `lucide-react`.

## Constraints

- Next.js 16 (see `AGENTS.md`: read `node_modules/next/dist/docs/` before using Next APIs).
  The page is `force-dynamic` and server-renders `Programmer`; read the query param on the
  client after mount to avoid hydration mismatch.
- `localStorage` may be unavailable (privacy settings — see `src/lib/theme.ts`). My presets
  must degrade gracefully: built-ins and export still work; show a note that saving isn't
  available.
- Preset actions are disabled while `busy` (build/upload/source loading), like the version
  select.

## Calls made during design (not explicitly decided by the owner)

- Ships with **no** built-in presets; the Built-in group is hidden until one exists.
- Selecting a preset replaces the form without a confirmation prompt, even if there were
  unsaved changes.
- "Restore defaults" clears the preset association to "Default".
- Skipped-settings note on apply; "Name (2)" on import clashes; delete confirmation.
- Export records the firmware version in the file, for information only.

## Left to the builder

- Exact component split (e.g. a `preset-picker.tsx` component), storage key name, button
  styling and wording, the save/edit dialog form.
- How built-ins are bundled (static import of JSON is expected).
