import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { firmwareSketchPath } from "../src/lib/firmware-path.mjs";
import { projectFromSource } from "../src/lib/project-config";
import { defaultSelection } from "../src/lib/config";
import { FirmwareSources } from "../cloudflare/sources";
import { handleService } from "../cloudflare/service";
import { BuildCoordinator } from "../cloudflare/build-cache";
import type { BuildResult } from "../src/lib/firmware";

class MemoryStore {
  data = new Map<string, string>();
  async get(key: string) { const value = this.data.get(key); return value ? { json: async <T>() => JSON.parse(value) as T } : null; }
  async put(key: string, value: string) { this.data.set(key, value); }
}
const source = await readFile(path.join(firmwareSketchPath(), "Config.h"), "utf8");
const revision = "a".repeat(40);

test("latest source refreshes HEAD and retains older project snapshots without leaking API credentials", async () => {
  const store = new MemoryStore();
  let current = revision, commitRequests = 0;
  const sources = new FirmwareSources(store, "test-token", async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.includes("api.github.com")) {
      assert.equal(headers.get("Authorization"), "Bearer test-token");
      commitRequests++;
      return Response.json({ sha: current });
    }
    assert.equal(headers.get("Authorization"), null);
    return new Response(url.endsWith("Config.h") ? source : 'FSTRING_VERSION[] = "V15.6";');
  });
  assert.equal((await sources.project()).revision, revision);
  assert.equal((await sources.project()).revision, revision);
  assert.equal(commitRequests, 1);
  current = "b".repeat(40);
  await store.put("metadata/latest.json", JSON.stringify({ at: 0, value: revision }));
  assert.equal((await sources.project()).revision, current);
  assert.equal((await sources.prepared(revision)).revision, revision);
  await assert.rejects(sources.project("release:../invalid"), /Invalid firmware/);
  await assert.rejects(sources.prepared("c".repeat(40)), /no longer available/);
});

test("Cloudflare API validates input and reuses equivalent builds across future visitors", async () => {
  const store = new MemoryStore();
  const project = projectFromSource(source, 'FSTRING_VERSION[] = "V15.6";', revision);
  await store.put(`projects/${revision}.json`, JSON.stringify(project));
  const values = { ...defaultSelection(project.schema), HW5: true };
  let calls = 0;
  const coordinator = new BuildCoordinator(store, async () => {
    calls++;
    return { hex: ":00000001FF\n", config: source, revision, version: project.version,
      log: "Compiled", flashBytes: 0, ramBytes: 0, duration: 10, fingerprint: "test" };
  });
  const request = (selection: unknown, origin = "https://reader.example") => new Request("https://reader.example/api/build", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ revision, values: selection }),
  });
  const first = await handleService(request(values), { BUILD_CACHE: store }, job => coordinator.build(job));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("X-Firmware-Cache"), "MISS");
  const reordered = Object.fromEntries(Object.entries(values).reverse());
  const second = await handleService(request(reordered), { BUILD_CACHE: store }, async () => { throw new Error("Must not call compiler"); });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("X-Firmware-Cache"), "HIT");
  assert.equal((await second.json() as BuildResult).cached, true);
  assert.equal(calls, 1);
  assert.equal((await handleService(request({}, "https://other.example"), { BUILD_CACHE: store }, job => coordinator.build(job))).status, 403);
  assert.equal((await handleService(request({}), { BUILD_CACHE: store }, job => coordinator.build(job))).status, 400);
  assert.equal((await handleService(request({ ...values, INJECT: "attack" }), { BUILD_CACHE: store }, job => coordinator.build(job))).status, 400);
});
