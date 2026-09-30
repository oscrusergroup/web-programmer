import { access, cp, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { projectFromSource } from "../project-config";
import { FirmwareError } from "../errors";
export { FirmwareError } from "../errors";
import { firmwareCacheRoot, firmwareDirectory, firmwareSource } from "../firmware-path.mjs";
import { setupFirmware } from "../../../scripts/setup-firmware.mjs";
import { getReleases } from "./releases";

const exec = promisify(execFile);
const state = globalThis as typeof globalThis & {
  cartreaderProjects?: Map<string, Promise<Awaited<ReturnType<typeof prepareProject>>>>;
};
// Share downloads across requests, with a small bound on simultaneous preparations.
const pending = state.cartreaderProjects ??= new Map();

export function preparedSketchPath(revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new FirmwareError("Invalid firmware revision.");
  return path.join(firmwareCacheRoot(), "build-sources", revision, firmwareSource.sketch);
}
export async function getPreparedProject(revision: string) {
  const sketch = preparedSketchPath(revision);
  let source: string, cpp: string;
  try {
    [source, cpp] = await Promise.all([
      readFile(path.join(sketch, "Config.h"), "utf8"),
      readFile(path.join(sketch, "OSCR.cpp"), "utf8"),
    ]);
  } catch {
    throw new FirmwareError("This firmware is no longer available. Select the firmware version again.", 409);
  }
  return projectFromSource(source, cpp, revision);
}

// Publish a complete, immutable sketch so a later setup or another visitor cannot change a build's input.
export async function prepareProject(directory: string) {
  const { stdout } = await exec("git", ["-C", directory, "rev-parse", "HEAD"], { timeout: 10_000 });
  const revision = stdout.trim();
  const sketch = preparedSketchPath(revision), destination = path.dirname(sketch);
  try { await access(destination); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(destination);
    await mkdir(parent, { recursive: true });
    const temporary = await mkdtemp(path.join(parent, ".prepare-"));
    try {
      await cp(path.join(directory, firmwareSource.sketch), path.join(temporary, firmwareSource.sketch), { recursive: true });
      try { await rename(temporary, destination); } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  return getPreparedProject(revision);
}

export async function getProject(id = "latest") {
  if (id !== "latest" && !(await getReleases()).some(release => release.id === id))
    throw new FirmwareError("Choose a published release from the list.");
  const existing = pending.get(id);
  if (existing) return existing;
  if (pending.size >= 2) throw new FirmwareError("Firmware downloads are busy. Please try again shortly.", 429);
  const job = (async () => {
    let directory = firmwareDirectory();
    if (id !== "latest") {
      const tag = id.slice("release:".length);
      directory = path.join(firmwareCacheRoot(), "releases", createHash("sha256").update(tag).digest("hex"));
      try {
        await setupFirmware({ source: { ...firmwareSource, ref: `refs/tags/${tag}` }, destination: directory, refreshCached: false });
      } catch (error) {
        console.error("Firmware download failed", error);
        throw new FirmwareError("Could not download this release. Retry, or choose a newer release if it lacks the required sketch files.", 502);
      }
    }
    return prepareProject(directory);
  })();
  pending.set(id, job);
  try { return await job; } finally { pending.delete(id); }
}
