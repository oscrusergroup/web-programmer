import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { firmwareSketchPath } from "../src/lib/firmware-path.mjs";
import { parseConfig, defaultSelection, validateSelection } from "../src/lib/config";
import {
  applyPreset,
  parsePresetFile,
  presetFile,
  presetFileName,
  rebasePreset,
  sameSelection,
  uniqueName,
} from "../src/lib/presets";
import { BUILT_IN_PRESETS } from "../src/presets";

const schema = parseConfig(readFileSync(path.join(firmwareSketchPath(), "Config.h"), "utf8"));

test("applies presets over defaults and skips unknown or invalid settings", () => {
  const { values, skipped } = applyPreset(schema, {
    HW5: true,
    ENABLE_RTC: true,
    NOT_A_REAL_OPTION: true,
    OPTION_LCD_BG_COLOR: "999,0,0",
  });
  assert.equal(skipped, 2);
  assert.equal(values.HW5, true);
  assert.equal(values.ENABLE_RTC, true);
  assert.ok(!("NOT_A_REAL_OPTION" in values));
  assert.equal(values.OPTION_LCD_BG_COLOR, defaultSelection(schema).OPTION_LCD_BG_COLOR);
  assert.equal(values.ENABLE_GBX, defaultSelection(schema).ENABLE_GBX);
});

test("repairs mutually exclusive settings", () => {
  const { values } = applyPreset(schema, {
    HW5: true, HW3: true, DS3231: true, DS1307: true,
  });
  assert.equal(values.HW5, true);
  assert.equal(values.HW3, false);
  assert.equal(values.DS1307, false);
  const rotary = applyPreset(schema, { HW1: true, ENABLE_ROTARY_NEW_OSCR: true }).values;
  if ("ENABLE_ROTARY_NEW_OSCR" in rotary) assert.equal(rotary.ENABLE_ROTARY_NEW_OSCR, false);
});

test("rebasing keeps preset values the old firmware lacked and the user's tweaks", () => {
  const older = schema.filter((o) => o.key !== "ENABLE_GBX");
  const preset = { HW5: true, ENABLE_GBX: !defaultSelection(schema).ENABLE_GBX, ENABLE_RTC: true };
  const current = { ...applyPreset(older, preset).values, ENABLE_RTC: false };
  const rebased = rebasePreset(older, schema, preset, current);
  assert.equal(rebased.ENABLE_GBX, preset.ENABLE_GBX);
  assert.equal(rebased.ENABLE_RTC, false);
  assert.equal(rebased.HW5, true);
  const untouched = rebasePreset(older, schema, preset, applyPreset(older, preset).values);
  assert.ok(sameSelection(untouched, applyPreset(schema, preset).values));
});

test("round-trips preset files and rejects invalid ones", () => {
  const values = applyPreset(schema, { HW5: true }).values;
  const text = presetFile(
    { name: "HW5 basics", description: "Everything on", values },
    { version: "15.0", revision: "a".repeat(40) },
  );
  const read = parsePresetFile(text);
  assert.equal(read.name, "HW5 basics");
  assert.deepEqual(read.values, values);
  assert.deepEqual(validateSelection(schema, applyPreset(schema, read.values).values), []);
  assert.throws(() => parsePresetFile("{"), /valid JSON/);
  assert.throws(() => parsePresetFile('{"format":"other"}'), /not an OSCR preset/);
  assert.throws(() => parsePresetFile(text.replace('"version": 1', '"version": 2')), /newer/);
  assert.throws(() => parsePresetFile(text.replace('"HW5 basics"', '"  "')), /no name/);
  assert.throws(() => parsePresetFile(text.replace('"HW5": true', '"HW5": 1')), /invalid setting/);
});

test("names and file names", () => {
  assert.equal(uniqueName("SNES", ["N64"]), "SNES");
  assert.equal(uniqueName("SNES", ["SNES", "SNES (2)"]), "SNES (3)");
  assert.equal(presetFileName("SNES + N64!"), "snes-n64.json");
  assert.equal(presetFileName("***"), "preset.json");
});

test("built-in presets have unique, link-safe ids and apply cleanly", () => {
  const ids = BUILT_IN_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const preset of BUILT_IN_PRESETS) {
    assert.match(preset.id, /^[a-z0-9-]+$/);
    assert.deepEqual(validateSelection(schema, applyPreset(schema, preset.values).values), [], preset.id);
  }
});
