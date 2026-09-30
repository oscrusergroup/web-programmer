import { test } from "node:test";
import assert from "node:assert/strict";
import { BuildCoordinator, buildKey } from "../cloudflare/build-cache";
import type { BuildResult } from "../src/lib/firmware";

class MemoryStore {
  data = new Map<string, string>();
  async get(key: string) { const value = this.data.get(key); return value ? { json: async <T>() => JSON.parse(value) as T } : null; }
  async put(key: string, value: string) { this.data.set(key, value); }
}
const result: BuildResult = { hex: ":00000001FF\n", config: "#define HW5", revision: "a".repeat(40), version: "V15.5", log: "Compiled", flashBytes: 0, ramBytes: 0, duration: 123, fingerprint: "example" };

test("build keys include source, generated settings, target and toolchain", async () => {
  const key = await buildKey("a".repeat(40), "#define HW5");
  assert.equal(await buildKey("a".repeat(40), "#define HW5"), key);
  assert.notEqual(await buildKey("b".repeat(40), "#define HW5"), key);
  assert.notEqual(await buildKey("a".repeat(40), "#define HW3"), key);
  assert.notEqual(await buildKey("a".repeat(40), "#define HW5", "changed toolchain"), key);
});

test("concurrent identical requests compile once and future instances reuse persistent results", async () => {
  const store = new MemoryStore();
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const coordinator = new BuildCoordinator(store, async () => { calls++; await gate; return result; });
  const job = { key: "same", revision: result.revision, values: { HW5: true } };
  const first = coordinator.build(job), second = coordinator.build(job);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[0].cached, false);
  assert.equal(results[1].cached, true);
  const restarted = new BuildCoordinator(store, async () => { throw new Error("Must not compile"); });
  assert.equal((await restarted.build(job)).cached, true);
});

test("different builds serialize, failed builds are retriable and never cached", async () => {
  const store = new MemoryStore();
  let active = 0, maxActive = 0, calls = 0;
  const coordinator = new BuildCoordinator(store, async job => {
    active++; maxActive = Math.max(maxActive, active); calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (job.key === "fail") throw new Error("Compiler failure");
    return result;
  });
  await Promise.all([coordinator.build({ key: "one", revision: result.revision, values: {} }), coordinator.build({ key: "two", revision: result.revision, values: {} })]);
  assert.equal(maxActive, 1);
  for (let i = 0; i < 2; i++) await assert.rejects(coordinator.build({ key: "fail", revision: result.revision, values: {} }), /Compiler failure/);
  assert.equal(calls, 4);
  assert.equal(store.data.has("builds/fail.json"), false);
});
