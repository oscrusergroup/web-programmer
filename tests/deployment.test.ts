import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

for (const { environment, command, bucket } of [
  { environment: "production", command: "cf:deploy:firmware", bucket: "cartreader-build-cache" },
  { environment: "preview", command: "cf:deploy:firmware:preview", bucket: "cartreader-build-cache-preview" },
]) {
  test(`${environment} firmware deployment keeps its own Worker identity and cache inside the website's CI job`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "cartreader-deploy-"));
    try {
      const { stdout, stderr } = await promisify(execFile)("pnpm", [
        "run", command, "--dry-run", "--containers-rollout", "none", "--outdir", directory,
      ], {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          WORKERS_CI: "1",
          WRANGLER_CI_OVERRIDE_NAME: "cartreader-web-programmer",
          WRANGLER_CI_MATCH_TAG: "website-worker-tag",
          WRANGLER_LOG_PATH: join(directory, "logs"),
          WRANGLER_SEND_METRICS: "false",
        },
        timeout: 60_000,
      });
      const output = stdout + stderr;
      assert.doesNotMatch(output, /Failed to match Worker name|Overriding using the CI provided Worker name/);
      assert.ok(output.includes(`env.BUILD_CACHE (${bucket})`), output);
      assert.match(output, /--dry-run: exiting now/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
