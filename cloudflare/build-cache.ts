import toolchain from "../toolchain.json";
import type { BuildResult } from "../src/lib/firmware";
import type { Selection } from "../src/lib/config";
import { FirmwareError } from "../src/lib/errors";

export const TOOLCHAIN_ID = JSON.stringify(toolchain);
export async function buildKey(revision: string, config: string, identity = TOOLCHAIN_ID) {
  const bytes = new TextEncoder().encode(JSON.stringify({ revision, config, toolchain: identity }));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
export type BuildJob = { key: string; revision: string; values: Selection };
export interface BuildStore {
  get(key: string): Promise<{ json<T>(): Promise<T> } | null>;
  put(key: string, value: string): Promise<unknown>;
}
export async function cachedBuild(store: BuildStore, key: string): Promise<BuildResult | null> {
  const object = await store.get(`builds/${key}.json`);
  return object ? { ...await object.json<BuildResult>(), cached: true, cacheKey: key } : null;
}

// One instance runs inside a globally named Durable Object. R2 survives container and DO restarts.
export class BuildCoordinator {
  private pending = new Map<string, Promise<BuildResult>>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private store: BuildStore, private compile: (job: BuildJob) => Promise<BuildResult>) {}
  async build(job: BuildJob): Promise<BuildResult> {
    const cached = await cachedBuild(this.store, job.key);
    if (cached) return cached;
    const pending = this.pending.get(job.key);
    if (pending) return { ...await pending, cached: true };
    if (this.pending.size >= 8) throw new FirmwareError("The build queue is full. Please try again shortly.", 429);
    const task = this.tail.then(async () => {
      const cached = await cachedBuild(this.store, job.key);
      if (cached) return cached;
      const result = { ...await this.compile(job), cached: false, cacheKey: job.key, builtAt: new Date().toISOString() };
      // Persist before replying, ensuring later visitors see the completed build immediately.
      await this.store.put(`builds/${job.key}.json`, JSON.stringify(result));
      return result;
    });
    this.pending.set(job.key, task);
    this.tail = task.catch(() => {});
    try { return await task; } finally { this.pending.delete(job.key); }
  }
}
