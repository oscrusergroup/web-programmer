import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../src/lib/server/run-command";
test("compiler process captures output and reports failed exits", async () => {
  assert.match(
    await runCommand(process.execPath, ["-e", "console.log('compiled')"]),
    /compiled/,
  );
  await assert.rejects(
    runCommand(process.execPath, [
      "-e",
      "console.error('compile error');process.exit(1)",
    ]),
    /compile error/,
  );
});
test("compiler process is bounded by time and output", async () => {
  await assert.rejects(
    runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeoutMs: 100,
    }),
    /time limit/,
  );
  await assert.rejects(
    runCommand(process.execPath, ["-e", "console.log('x'.repeat(4096))"], {
      outputLimit: 1024,
    }),
    /output limit/,
  );
});
