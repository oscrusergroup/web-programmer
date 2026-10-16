import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setupFirmware } from "../scripts/setup-firmware.mjs";

test("firmware setup follows remote HEAD, refreshes cached content, and preserves local changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "firmware-source-test-"));
  const remote = path.join(root, "remote"), destination = path.join(root, "cache", "cartreader");
  const git = (cwd: string, args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const source = { slug: "test/cartreader", repository: remote, ref: "HEAD", sketch: "Cart_Reader" };
  try {
    await mkdir(path.join(remote, "Cart_Reader"), { recursive: true });
    git(remote, ["init", "--quiet", "-b", "firmware-default"]);
    for (const file of ["Config.h", "OSCR.cpp", "Cart_Reader.ino"]) await writeFile(path.join(remote, "Cart_Reader", file), "first version\n");
    const commit = () => { git(remote, ["add", "."]); git(remote, ["-c", "user.name=Firmware test", "-c", "user.email=firmware@example.invalid", "commit", "--quiet", "-m", "Update firmware"]); };
    commit();
    await setupFirmware({ source, destination });
    assert.equal(await readFile(path.join(destination, "Cart_Reader", "Config.h"), "utf8"), "first version\n");
    await writeFile(path.join(remote, "Cart_Reader", "Config.h"), "latest version\n");
    commit();
    await setupFirmware({ source, destination });
    assert.equal(git(destination, ["rev-parse", "HEAD"]), git(remote, ["rev-parse", "HEAD"]));
    assert.equal(await readFile(path.join(destination, "Cart_Reader", "Config.h"), "utf8"), "latest version\n");
    await writeFile(path.join(destination, "Cart_Reader", "Config.h"), "local edit\n");
    await assert.rejects(setupFirmware({ source, destination }), /local changes/);
    assert.equal(await readFile(path.join(destination, "Cart_Reader", "Config.h"), "utf8"), "local edit\n");
    git(destination, ["restore", "Cart_Reader/Config.h"]);
    await rename(remote, `${remote}-unavailable`);
    await assert.rejects(setupFirmware({ source, destination }));
    assert.equal(await readFile(path.join(destination, "Cart_Reader", "Config.h"), "utf8"), "latest version\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
