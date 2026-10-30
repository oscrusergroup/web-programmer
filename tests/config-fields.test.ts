import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toggle } from "../src/components/config-fields";
import type { ConfigOption } from "../src/lib/config";

const option: ConfigOption = {
  key: "ENABLE_ROTARY_NEW_OSCR",
  label: "New OSCR rotary display",
  description: "",
  section: "HARDWARE MODULES",
  enabled: false,
  value: "",
  kind: "boolean",
  line: 0,
};

test("a toggle's label targets its switch, not its info button", () => {
  const html = renderToStaticMarkup(
    createElement(Toggle, {
      option,
      value: false,
      onChange: () => {},
      disabled: false,
      onInfo: () => {},
    }),
  );
  // A label without `for` targets its first labelable descendant: the info button.
  const target = html.match(/<label[^>]*\sfor="([^"]+)"/)?.[1];
  assert.ok(target, "label needs an explicit for attribute");
  const input = html.match(/<input[^>]*>/)?.[0];
  assert.ok(input?.includes(`id="${target}"`), "label must point at the checkbox");
});
