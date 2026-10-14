import { fetchReleases } from "../src/lib/server/releases";
import { projectFromSource } from "../src/lib/project-config";
import { FirmwareError } from "../src/lib/errors";
import type { FirmwareProject, FirmwareRelease } from "../src/lib/firmware";
import type { BuildStore } from "./build-cache";
import { gitRevision } from "./git-refs";

type Timed<T> = { at: number; value: T; retryAt?: number };
class GitHubError extends FirmwareError {
  constructor(readonly upstreamStatus: number, readonly retryAt = Date.now() + 60_000) {
    super(`GitHub could not load this firmware (${upstreamStatus}). Please try again shortly.`, 502);
  }
}
export class FirmwareSources {
  // Workers' global fetch rejects calls with a FirmwareSources receiver.
  constructor(private store: BuildStore, private githubToken?: string, private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private async upstream(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", "cartreader-web-programmer");
    // Send credentials only to the GitHub API, never the raw source host.
    if (url.startsWith("https://api.github.com/") && this.githubToken) headers.set("Authorization", `Bearer ${this.githubToken}`);
    const response = await this.fetcher(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = Number(retryAfter);
      const retryAt = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : Date.now() + seconds * 1000;
      const resetAt = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
      throw new GitHubError(response.status, Math.max(Date.now() + 60_000,
        ...[retryAt, resetAt].filter(Number.isFinite)));
    }
    return response;
  }
  private async revision(id: string): Promise<string> {
    const ref = id === "latest" ? "HEAD" : id.slice("release:".length);
    try {
      const response = await this.upstream(`https://api.github.com/repos/sanni/cartreader/commits/${encodeURIComponent(ref)}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      const data = await response.json() as { sha?: unknown };
      if (typeof data.sha !== "string" || !/^[a-f0-9]{40}$/.test(data.sha))
        throw new FirmwareError("GitHub returned an invalid firmware revision.", 502);
      return data.sha;
    } catch (error) {
      if (!(error instanceof GitHubError) || ![403, 429].includes(error.upstreamStatus)) throw error;
      // Public Git ref discovery does not consume the REST API quota. It
      // resolves current HEAD without substituting a stale cached revision.
      const response = await this.upstream("https://github.com/sanni/cartreader.git/info/refs?service=git-upload-pack", {
        headers: { Accept: "application/x-git-upload-pack-advertisement" },
        cache: "no-store",
      });
      if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "application/x-git-upload-pack-advertisement")
        throw new FirmwareError("GitHub returned an invalid Git ref advertisement.", 502);
      return gitRevision(await response.arrayBuffer(), id === "latest" ? "HEAD" : `refs/tags/${ref}`);
    }
  }
  async releases(): Promise<FirmwareRelease[]> {
    const object = await this.store.get("metadata/releases.json");
    const cached = object ? await object.json<Timed<FirmwareRelease[]>>() : null;
    if (cached && (Date.now() - cached.at < 300_000 || (cached.retryAt ?? 0) > Date.now())) return cached.value;
    let value: FirmwareRelease[];
    try {
      value = await fetchReleases((input, init) => this.upstream(String(input), init));
    } catch (error) {
      if (!cached || !(error instanceof GitHubError) || ![403, 429].includes(error.upstreamStatus)) throw error;
      // Retain the last published choices while honoring GitHub's retry time.
      // Keep their original age so recovery triggers a real metadata refresh.
      await this.store.put("metadata/releases.json", JSON.stringify({ ...cached, retryAt: error.retryAt }));
      return cached.value;
    }
    await this.store.put("metadata/releases.json", JSON.stringify({ at: Date.now(), value }));
    return value;
  }
  async project(id = "latest"): Promise<FirmwareProject> {
    if (id !== "latest" && !/^release:[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id))
      throw new FirmwareError("Invalid firmware source.");
    if (id !== "latest" && !(await this.releases()).some(release => release.id === id))
      throw new FirmwareError("Choose a published release from the list.");
    const pointerKey = `metadata/${encodeURIComponent(id)}.json`;
    const object = await this.store.get(pointerKey);
    const cached = object ? await object.json<Timed<string>>() : null;
    const ttl = id === "latest" ? 60_000 : 300_000;
    let revision = cached && Date.now() - cached.at < ttl ? cached.value : "";
    if (!revision) revision = await this.revision(id);
    const projectKey = `projects/${revision}.json`;
    const prepared = await this.store.get(projectKey);
    let project = prepared ? await prepared.json<FirmwareProject>() : null;
    if (!project) {
      const raw = `https://raw.githubusercontent.com/sanni/cartreader/${revision}/Cart_Reader`;
      const [config, cpp] = await Promise.all([this.upstream(`${raw}/Config.h`), this.upstream(`${raw}/OSCR.cpp`)]);
      project = projectFromSource(await config.text(), await cpp.text(), revision);
      await this.store.put(projectKey, JSON.stringify(project));
    }
    if (!cached || cached.value !== revision || Date.now() - cached.at >= ttl)
      await this.store.put(pointerKey, JSON.stringify({ at: Date.now(), value: revision }));
    return project;
  }
  async prepared(revision: string) {
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new FirmwareError("Invalid firmware revision.");
    const object = await this.store.get(`projects/${revision}.json`);
    if (!object) throw new FirmwareError("This firmware is no longer available. Select the firmware version again.", 409);
    return object.json<FirmwareProject>();
  }
}
