import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { firmwareSketchPath } from "../src/lib/firmware-path.mjs";
import { FirmwareError } from "../src/lib/errors";
import { FirmwareSources, metadataReply, metadataValue } from "../cloudflare/sources";
import { handleService } from "../cloudflare/service";

class MemoryStore {
  data = new Map<string, string>();
  async get(key: string) { const value = this.data.get(key); return value ? { json: async <T>() => JSON.parse(value) as T } : null; }
  async put(key: string, value: string) { this.data.set(key, value); }
}
const config = await readFile(path.join(firmwareSketchPath(), "Config.h"), "utf8");
const revision = "a".repeat(40);
const release = (tag: string) => ({ id: `release:${tag}`, tag, label: tag, prerelease: false });
const notBuilt = async () => { throw new Error("Must not compile"); };

// Answers GitHub like production, holding each reply until every caller has joined.
function github(sha = revision) {
  const requests: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);
    await new Promise(resolve => setTimeout(resolve, 5));
    if (url.includes("/releases?")) return Response.json([{ tag_name: "V15.5", name: "V15.5", draft: false, prerelease: false }]);
    if (url.includes("/commits/")) return Response.json({ sha });
    return new Response(url.endsWith("Config.h") ? config : 'FSTRING_VERSION[] = "V15.5";');
  };
  const count = (part: string) => requests.filter(url => url.includes(part)).length;
  return { requests, fetcher, count };
}
const tenTimes = <T>(run: (index: number) => Promise<T>) => Promise.all(Array.from({ length: 10 }, (_, index) => run(index)));

test("simultaneous releases calls on separate instances share one GitHub fetch", async () => {
  const store = new MemoryStore();
  const { requests, fetcher } = github();
  const results = await tenTimes(() => new FirmwareSources(store, "token", fetcher).releases());
  assert.equal(requests.length, 1);
  for (const result of results) assert.deepEqual(result, [release("V15.5")]);
  assert.deepEqual(JSON.parse(store.data.get("metadata/releases.json")!).value, [release("V15.5")]);
});

test("simultaneous cold project resolution shares the revision and raw source fetches", async () => {
  const store = new MemoryStore();
  const { requests, fetcher, count } = github();
  const results = await tenTimes(() => new FirmwareSources(store, "token", fetcher).project());
  assert.equal(count("/commits/"), 1);
  assert.equal(count("/Config.h"), 1);
  assert.equal(count("/OSCR.cpp"), 1);
  assert.equal(requests.length, 3);
  for (const result of results) assert.equal(result.revision, revision);
  assert.equal(JSON.parse(store.data.get("metadata/latest.json")!).value, revision);
});

test("simultaneous release resolution shares the published release check", async () => {
  const { requests, fetcher, count } = github();
  const store = new MemoryStore();
  await tenTimes(() => new FirmwareSources(store, "token", fetcher).project("release:V15.5"));
  assert.equal(count("/releases?"), 1);
  assert.equal(count("/commits/"), 1);
  assert.equal(requests.length, 4);
});

test("an expired revision pointer refreshes once for simultaneous callers", async () => {
  const store = new MemoryStore();
  const first = github();
  await new FirmwareSources(store, undefined, first.fetcher).project();
  const pointer = JSON.parse(store.data.get("metadata/latest.json")!);
  await store.put("metadata/latest.json", JSON.stringify({ ...pointer, at: 0 }));
  const { requests, fetcher, count } = github();
  await tenTimes(() => new FirmwareSources(store, undefined, fetcher).project());
  assert.equal(count("/commits/"), 1);
  assert.equal(requests.length, 1, "The prepared project is still cached");
});

test("different sources resolving to one revision prepare its project once", async () => {
  const store = new MemoryStore();
  await store.put("metadata/releases.json", JSON.stringify({ at: Date.now(), value: [release("V15.5")] }));
  const { fetcher, count } = github();
  const sources = new FirmwareSources(store, "token", fetcher);
  const [latest, published] = await Promise.all([sources.project(), sources.project("release:V15.5")]);
  assert.equal(count("/commits/"), 2);
  assert.equal(count("/Config.h"), 1);
  assert.equal(count("/OSCR.cpp"), 1);
  assert.deepEqual(latest, published);
});

test("failed fetches reject every waiting caller, then the next call retries", async () => {
  const store = new MemoryStore();
  let requests = 0, failing = true;
  const fetcher: typeof fetch = async () => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return failing ? new Response("Unavailable", { status: 503 }) : Response.json([]);
  };
  const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => new FirmwareSources(store, undefined, fetcher).releases()));
  assert.equal(requests, 1);
  for (const outcome of outcomes) assert.equal(outcome.status, "rejected");
  assert.equal(store.data.size, 0);
  failing = false;
  assert.deepEqual(await new FirmwareSources(store, undefined, fetcher).releases(), []);
  assert.equal(requests, 2, "A settled failure must not remain in flight");
});

test("a failed project source does not block its retry", async () => {
  const store = new MemoryStore();
  const healthy = github();
  let failing = true;
  const fetcher: typeof fetch = async (input, init) => failing && String(input).endsWith("Config.h")
    ? new Response("Unavailable", { status: 500 }) : healthy.fetcher(input, init);
  await assert.rejects(new FirmwareSources(store, undefined, fetcher).project(), /GitHub/);
  failing = false;
  assert.equal((await new FirmwareSources(store, undefined, fetcher).project()).revision, revision);
});

test("completed fetches leave the TTL cache in charge", async () => {
  const store = new MemoryStore();
  const { fetcher, count } = github();
  await new FirmwareSources(store, undefined, fetcher).releases();
  await new FirmwareSources(store, undefined, fetcher).releases();
  assert.equal(count("/releases?"), 1);
  const cached = JSON.parse(store.data.get("metadata/releases.json")!);
  await store.put("metadata/releases.json", JSON.stringify({ ...cached, at: Date.now() - 300_000 }));
  await new FirmwareSources(store, undefined, fetcher).releases();
  assert.equal(count("/releases?"), 2);
});

test("simultaneous throttled refreshes share the cached fallback and its retry time", async () => {
  const store = new MemoryStore();
  const value = [release("V15.0")];
  await store.put("metadata/releases.json", JSON.stringify({ at: 0, value }));
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response("Rate limited", { status: 429, headers: { "Retry-After": "120" } });
  };
  const results = await tenTimes(() => new FirmwareSources(store, undefined, fetcher).releases());
  assert.equal(requests, 1);
  for (const result of results) assert.deepEqual(result, value);
  const cached = JSON.parse(store.data.get("metadata/releases.json")!);
  assert.equal(cached.at, 0);
  assert.ok(cached.retryAt > Date.now() + 60_000);
});

test("in-flight work is never shared across stores, credentials, fetchers or sources", async () => {
  const seen: (string | null)[] = [];
  const shared = github();
  const fetcher: typeof fetch = async (input, init) => {
    seen.push(new Headers(init?.headers).get("Authorization"));
    return shared.fetcher(input, init);
  };
  const store = new MemoryStore();
  await Promise.all([
    new FirmwareSources(store, "first", fetcher).releases(),
    new FirmwareSources(store, "second", fetcher).releases(),
    new FirmwareSources(store, undefined, fetcher).releases(),
    new FirmwareSources(new MemoryStore(), "first", fetcher).releases(),
  ]);
  assert.deepEqual(seen.sort(), ["Bearer first", "Bearer first", "Bearer second", null].sort());

  const other = github();
  await Promise.all([
    new FirmwareSources(store, "fetcher", shared.fetcher).project(),
    new FirmwareSources(store, "fetcher", other.fetcher).project(),
  ]);
  assert.equal(other.count("/commits/"), 1);

  const sources = github();
  const fresh = new MemoryStore();
  await Promise.all([
    new FirmwareSources(fresh, "token", sources.fetcher).project(),
    new FirmwareSources(fresh, "token", sources.fetcher).project("release:V15.5"),
  ]);
  assert.equal(sources.count("/commits/"), 2, "Each source resolves its own revision");
});

test("default fetchers share in-flight work with the global receiver", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Illegal invocation: function called with incorrect this reference.");
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json([]);
  };
  try {
    const store = new MemoryStore();
    await tenTimes(() => new FirmwareSources(store).releases());
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("metadata replies carry firmware failures across RPC and hide unexpected ones", async () => {
  assert.deepEqual(await metadataReply(async () => "value"), { ok: true, value: "value" });
  assert.deepEqual(await metadataReply(async () => { throw new FirmwareError("Choose a release.", 400); }),
    { ok: false, status: 400, error: "Choose a release." });
  const originalError = console.error;
  console.error = () => {};
  try {
    const reply = await metadataReply(async () => { throw new Error("internal detail"); });
    assert.equal(reply.ok, false);
    assert.doesNotMatch(JSON.stringify(reply), /internal detail/);
  } finally {
    console.error = originalError;
  }
  assert.equal(metadataValue({ ok: true, value: 1 }), 1);
  assert.throws(() => metadataValue({ ok: false, status: 409, error: "Gone" }),
    (error: FirmwareError) => error instanceof FirmwareError && error.status === 409 && error.message === "Gone");
});

test("the service answers metadata routes from the coordinated source", async () => {
  const untouched = { get: async () => assert.fail("The Worker must not resolve metadata itself"), put: async () => assert.fail("The Worker must not store metadata itself") };
  const requested: (string | undefined)[] = [];
  const metadata = {
    releases: async () => [release("V15.5")],
    project: async (id?: string) => {
      requested.push(id);
      if (id === "release:missing") throw new FirmwareError("Choose a published release from the list.");
      return { revision } as never;
    },
  };
  const get = (route: string) => handleService(new Request(`https://firmware.example${route}`), { BUILD_CACHE: untouched }, notBuilt, metadata);
  assert.deepEqual(await (await get("/api/releases")).json(), { releases: [release("V15.5")] });
  assert.deepEqual(await (await get("/api/firmware?source=release:V15.5")).json(), { revision });
  assert.equal((await get("/api/firmware?source=release:missing")).status, 400);
  assert.equal((await get("/api/firmware")).status, 200);
  assert.deepEqual(requested, ["release:V15.5", "release:missing", "latest"]);
});
