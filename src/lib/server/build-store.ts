import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BuildStore } from "../../../cloudflare/build-cache";

// Mirror R2 caching during ordinary Node development and Docker hosting.
export class FileBuildStore implements BuildStore {
  constructor(private root: string) {}
  async get(key: string) {
    try {
      const data = await readFile(path.join(this.root, key), "utf8");
      return { json: async <T>() => JSON.parse(data) as T };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async put(key: string, value: string) {
    const destination = path.join(this.root, key);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, value); await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }); }
  }
}
