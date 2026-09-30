import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { firmwareSource, firmwareDirectory } from "../src/lib/firmware-path.mjs";

const requiredFiles = ["Config.h", "OSCR.cpp", "Cart_Reader.ino"];
const exec = promisify(execFile);
const git = async (directory, args) => (await exec("git", ["-C", directory, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
})).stdout.trim();

async function requireClean(directory, source) {
  if (await git(directory, ["remote", "get-url", "origin"]) !== source.repository)
    throw new Error("The firmware cache origin does not match firmware-source.mjs. Move that cache directory before retrying.");
  if (await git(directory, ["status", "--porcelain", "--untracked-files=all"]))
    throw new Error("The firmware cache has local changes. Preserve them and move that cache directory before retrying.");
}

async function refresh(directory, source) {
  console.log(`Fetching latest ${source.ref} from ${source.repository}…`);
  await git(directory, ["fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", source.ref]);
  // Validate the incoming tree before replacing the current checkout.
  for (const file of requiredFiles)
    await git(directory, ["cat-file", "-e", `FETCH_HEAD:${source.sketch}/${file}`]);
  await git(directory, ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  await Promise.all(requiredFiles.map(file => access(path.join(directory, source.sketch, file))));
  console.log(`Firmware ready: ${await git(directory, ["rev-parse", "--short=12", "HEAD"])} (latest ${source.ref})`);
}

export async function setupFirmware({ source = firmwareSource, destination = firmwareDirectory(), refreshCached = true } = {}) {
  let cached = false;
  try { await access(destination); cached = true; } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (cached) {
    await requireClean(destination, source);
    if (refreshCached) await refresh(destination, source);
    return;
  }

  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, ".download-"));
  try {
    await git(temporary, ["init", "--quiet"]);
    await git(temporary, ["remote", "add", "origin", source.repository]);
    // Only materialize the sketch and license, avoiding hardware designs and SD data.
    await git(temporary, ["sparse-checkout", "set", "--no-cone", `/${source.sketch}/`, "/LICENSE", "/README.md"]);
    await refresh(temporary, source);
    try { await rename(temporary, destination); } catch (error) {
      // Another setup command may have populated the cache concurrently.
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      await requireClean(destination, source);
      await refresh(destination, source);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await setupFirmware();
