import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { firmwareSketchPath } from "../src/lib/firmware-path.mjs";
import { prepareProject, getPreparedProject, preparedSketchPath } from "../src/lib/server/project";

test("selected versions keep independent Config.h snapshots when the checkout changes", async () => {
  const config = await readFile(path.join(firmwareSketchPath(), "Config.h"), "utf8");
  const root = await mkdtemp(path.join(tmpdir(), "firmware-snapshot-"));
  const previous = process.env.FIRMWARE_CACHE_DIR;
  process.env.FIRMWARE_CACHE_DIR = path.join(root, "cache");
  const repository = path.join(root, "repository");
  const sketch = path.join(repository, "Cart_Reader");
  const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
  const commit = () => { git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Firmware"); };
  try {
    await mkdir(sketch, { recursive: true });
    git("init", "-q");
    await writeFile(path.join(sketch, "Config.h"), config);
    await writeFile(path.join(sketch, "OSCR.cpp"), 'FSTRING_VERSION[] = "V15.5";');
    await writeFile(path.join(sketch, "Cart_Reader.ino"), "// sketch");
    commit();
    const release = await prepareProject(repository);
    await writeFile(path.join(sketch, "Config.h"), config + "\n// newer version\n");
    await writeFile(path.join(sketch, "OSCR.cpp"), 'FSTRING_VERSION[] = "V15.6";');
    commit();
    const latest = await prepareProject(repository);
    assert.notEqual(release.revision, latest.revision);
    assert.equal((await getPreparedProject(release.revision)).source, config);
    assert.equal((await getPreparedProject(latest.revision)).version, "V15.6");
    assert.notEqual(preparedSketchPath(release.revision), preparedSketchPath(latest.revision));
    await writeFile(path.join(sketch, "Config.h"), "// unsupported old format");
    commit();
    await assert.rejects(prepareProject(repository), /older Config.h format/);
    assert.throws(() => preparedSketchPath("../../escape"), /Invalid firmware/);
  } finally {
    if (previous === undefined) delete process.env.FIRMWARE_CACHE_DIR;
    else process.env.FIRMWARE_CACHE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
