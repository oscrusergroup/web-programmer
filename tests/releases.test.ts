import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchReleases } from "../src/lib/server/releases";

test("release discovery uses published tags and labels prereleases", async () => {
  const releases = await fetchReleases(async () => Response.json([
    { tag_name: "V15.5", name: "Version 15.5", draft: false, prerelease: false },
    { tag_name: "V16-beta", name: "", draft: false, prerelease: true },
    { tag_name: "secret", draft: true },
    { tag_name: "../invalid", draft: false },
  ]));
  assert.deepEqual(releases, [
    { id: "release:V15.5", tag: "V15.5", label: "Version 15.5", prerelease: false },
    { id: "release:V16-beta", tag: "V16-beta", label: "V16-beta", prerelease: true },
  ]);
});

test("release discovery reports GitHub failure instead of presenting an empty list", async () => {
  await assert.rejects(fetchReleases(async () => new Response("", { status: 403 })), /GitHub/);
});
