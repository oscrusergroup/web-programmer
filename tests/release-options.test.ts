import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupportedRelease } from "../src/lib/release-options";

test("version dropdown includes V15.0 and newer, using numeric version ordering", () => {
  const tags = ["V9.5", "V14.7", "V15.0", "V15.5", "V15.10", "V16-beta", "V20.0", "20250421"];
  assert.deepEqual(tags.filter(tag => isSupportedRelease({ tag })), [
    "V15.0", "V15.5", "V15.10", "V16-beta", "V20.0",
  ]);
});
