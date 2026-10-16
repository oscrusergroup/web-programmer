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

test("release dropdown retains cached published choices during GitHub throttling", async () => {
  for (const status of [403, 429]) {
    const store = new MemoryStore();
    const value = [{ id: "release:V15.0", tag: "V15.0", label: "V15.0", prerelease: false }];
    await store.put("metadata/releases.json", JSON.stringify({ at: 0, value }));
    let requests = 0;
    const sources = new FirmwareSources(store, undefined, async () => {
      requests++;
      return new Response("Rate limited", { status });
    });
    assert.deepEqual(await sources.releases(), value);
    assert.deepEqual(await sources.releases(), value);
    assert.equal(requests, 1, "Cached fallback must back off before retrying GitHub");
    const cached = JSON.parse(store.data.get("metadata/releases.json")!);
    assert.equal(cached.at, 0, "Throttling must not mark stale releases as fresh");
    await store.put("metadata/releases.json", JSON.stringify({ ...cached, retryAt: 0 }));
    const recovered = new FirmwareSources(store, undefined, async () => Response.json([
      { tag_name: "V15.5", name: "V15.5", draft: false, prerelease: false },
    ]));
    assert.equal((await recovered.releases())[0].tag, "V15.5");
    await assert.rejects(new FirmwareSources(new MemoryStore(), undefined,
      async () => new Response("Rate limited", { status })).releases(), /GitHub/);
  }
});

function gitAdvertisement(records: string[]) {
  const packet = (value: string) => (Buffer.byteLength(value) + 4).toString(16).padStart(4, "0") + value;
  return packet("# service=git-upload-pack\n") + "0000" + records.map(packet).join("") + "0000";
}

for (const status of [403, 429]) test(`latest firmware loads and follows HEAD when the GitHub API returns ${status}`, async () => {
  const store = new MemoryStore();
  let current = revision;
  const sources = new FirmwareSources(store, "test-token", async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url === "https://api.github.com/repos/OSCR-User-Group/cartreader/commits/HEAD")
      return new Response("API rate limit exceeded", { status });
    assert.equal(headers.get("Authorization"), null, "API credentials must not reach public Git or raw hosts");
    if (url === "https://github.com/OSCR-User-Group/cartreader.git/info/refs?service=git-upload-pack")
      return new Response(gitAdvertisement([
        `${current} HEAD\0multi_ack symref=HEAD:refs/heads/main\n`,
        `${current} refs/heads/main\n`,
      ]), { headers: { "Content-Type": "application/x-git-upload-pack-advertisement" } });
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/OSCR-User-Group/cartreader/${current}/Cart_Reader/`));
    return new Response(url.endsWith("Config.h") ? source : 'FSTRING_VERSION[] = "V15.6";');
  });
  assert.equal((await sources.project()).revision, revision);
  current = "b".repeat(40);
  await store.put("metadata/latest.json", JSON.stringify({ at: 0, value: revision }));
  assert.equal((await sources.project()).revision, "b".repeat(40));
  assert.equal((await sources.prepared(revision)).revision, revision);
});

test("release fallback uses the peeled commit of an annotated published tag", async () => {
  const store = new MemoryStore();
  await store.put("metadata/releases.json", JSON.stringify({ at: Date.now(), value: [
    { id: "release:V15.5", tag: "V15.5", label: "V15.5", prerelease: false },
  ] }));
  const sources = new FirmwareSources(store, undefined, async input => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) return new Response("Rate limited", { status: 403 });
    if (url.startsWith("https://github.com/")) return new Response(gitAdvertisement([
      `${revision} HEAD\0multi_ack\n`,
      `${"c".repeat(40)} refs/tags/V15.5\n`,
      `${"b".repeat(40)} refs/tags/V15.5^{}\n`,
    ]), { headers: { "Content-Type": "application/x-git-upload-pack-advertisement" } });
    assert.ok(url.includes(`/${"b".repeat(40)}/Cart_Reader/`));
    return new Response(url.endsWith("Config.h") ? source : 'FSTRING_VERSION[] = "V15.5";');
  });
  assert.equal((await sources.project("release:V15.5")).revision, "b".repeat(40));
  await assert.rejects(sources.project("release:unpublished"), /published release/);
});

test("Git fallback rejects malformed or incomplete ref advertisements without caching a revision", async () => {
  const valid = gitAdvertisement([`${revision} HEAD\0multi_ack\n`]);
  for (const body of ["<html>Upstream unavailable</html>", valid.slice(0, -4), valid + "ffffshort", gitAdvertisement([`${revision} refs/heads/HEAD\0multi_ack\n`])]) {
    const store = new MemoryStore();
    const sources = new FirmwareSources(store, undefined, async input => String(input).startsWith("https://api.github.com/")
      ? new Response("Rate limited", { status: 403 })
      : new Response(body, { headers: { "Content-Type": "application/x-git-upload-pack-advertisement" } }));
    await assert.rejects(sources.project(), /GitHub returned an invalid Git ref advertisement/);
    assert.equal(store.data.size, 0);
  }
});

test("missing GitHub revisions remain errors instead of invoking the throttling fallback", async () => {
  let gitRequests = 0;
  const sources = new FirmwareSources(new MemoryStore(), undefined, async input => {
    if (String(input).startsWith("https://github.com/")) gitRequests++;
    return new Response("Not found", { status: 404 });
  });
  await assert.rejects(sources.project(), /404/);
  assert.equal(gitRequests, 0);
});

test("default upstream fetch loads firmware with the global receiver required by Workers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (this: unknown, input, init) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Illegal invocation: function called with incorrect this reference.");
    const url = String(input);
    assert.equal(new Headers(init?.headers).get("User-Agent"), "cartreader-web-programmer");
    return url.startsWith("https://api.github.com/")
      ? Response.json({ sha: revision })
      : new Response(url.endsWith("Config.h") ? source : 'FSTRING_VERSION[] = "V15.6";');
  };
  try {
    const sources = new FirmwareSources(new MemoryStore());
    assert.equal((await sources.project()).revision, revision);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
