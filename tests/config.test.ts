import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseConfig,
  defaultSelection,
  generateConfig,
  validateSelection,
} from "../src/lib/config";

const source = readFileSync("arduino-code/Cart_Reader/Config.h", "utf8");
test("parses actual options without documentation examples or derived defines", () => {
  const schema = parseConfig(source);
  assert.equal(schema.filter((o) => o.key === "HW5").length, 1);
  assert.equal(schema.find((o) => o.key === "ENABLE_GBX")?.enabled, true);
  assert.equal(schema.find((o) => o.key === "ENABLE_RTC")?.enabled, false);
  assert.ok(
    !schema.some((o) => o.key === "ENABLE_LCD" || o.key === "CONFIG_H_"),
  );
  assert.match(
    schema.find((o) => o.key === "ENABLE_VSELECT")!.description,
    /VSELECT/,
  );
});
test("requires hardware and validates dependencies and unsafe combinations", () => {
  const schema = parseConfig(source),
    values = defaultSelection(schema);
  assert.match(validateSelection(schema, values).join(), /hardware/i);
  values.HW5 = true;
  assert.deepEqual(validateSelection(schema, values), []);
  values.HW3 = true;
  assert.match(validateSelection(schema, values).join(), /exactly one/i);
  values.HW3 = false;
  values.ENABLE_SFM = true;
  values.ENABLE_SNES = false;
  assert.match(validateSelection(schema, values).join(), /ENABLE_SNES/);
  values.ENABLE_SFM = false;
  values.HW5 = false;
  values.HW4 = true;
  values.ENABLE_VSELECT = true;
  assert.match(validateSelection(schema, values).join(), /VSELECT/);
});
test("generation round trips defaults and preserves the processing section byte for byte", () => {
  const schema = parseConfig(source),
    values = defaultSelection(schema);
  values.HW3 = true;
  values.OPTION_LCD_BG_COLOR = "25, 50, 100";
  const output = generateConfig(source, schema, values);
  assert.equal(
    output.split("/*==== PROCESSING")[1],
    source.split("/*==== PROCESSING")[1],
  );
  assert.match(output, /\r\n#define HW3\r\n/);
  assert.match(output, /#define OPTION_LCD_BG_COLOR 25, 50, 100/);
  assert.equal(parseConfig(output).find((o) => o.key === "HW3")?.enabled, true);
});
test("rejects arbitrary defines, wrong types, incomplete payloads and code injection", () => {
  const schema = parseConfig(source),
    values = { ...defaultSelection(schema), HW5: true };
  assert.ok(validateSelection(schema, { ...values, EVIL: true }).length);
  assert.ok(
    validateSelection(schema, { ...values, ENABLE_SNES: "yes" }).length,
  );
  assert.ok(
    validateSelection(schema, {
      ...values,
      OPTION_LCD_BG_COLOR: "1,2,3\n#include <evil>",
    }).length,
  );
  assert.ok(
    validateSelection(schema, { ...values, OPTION_MD_DEFAULT_SAVE_TYPE: "3" })
      .length,
  );
  assert.ok(validateSelection(schema, { HW5: true }).length);
});
