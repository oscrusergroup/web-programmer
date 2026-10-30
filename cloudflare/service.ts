import { validateSelection, generateConfig, type Selection } from "../src/lib/config";
import { FirmwareError } from "../src/lib/errors";
import { validateBuildOrigin, readBuildRequest } from "../src/lib/build-request";
import { buildKey, cachedBuild, type BuildJob, type BuildStore } from "./build-cache";
import { FirmwareSources, type FirmwareMetadata } from "./sources";
import type { BuildResult } from "../src/lib/firmware";

export interface ServiceEnv {
  BUILD_CACHE: BuildStore;
  GITHUB_TOKEN?: string;
  APP_ORIGIN?: string;
}
export async function handleService(request: Request, env: ServiceEnv, compile: (job: BuildJob) => Promise<BuildResult>, metadata?: FirmwareMetadata) {
  const url = new URL(request.url);
  const sources = new FirmwareSources(env.BUILD_CACHE, env.GITHUB_TOKEN);
  const resolver = metadata ?? sources;
  const headers = { "Cache-Control": "no-store" };
  try {
    if (request.method === "GET" && url.pathname === "/api/health")
      return Response.json({ ready: true, backend: "cloudflare" }, { headers });
    if (request.method === "GET" && url.pathname === "/api/releases")
      return Response.json({ releases: await resolver.releases() }, { headers });
    if (request.method === "GET" && url.pathname === "/api/firmware")
      return Response.json(await resolver.project(url.searchParams.get("source") ?? "latest"), { headers });
    if (request.method === "POST" && url.pathname === "/api/build") {
      validateBuildOrigin(request, env.APP_ORIGIN);
      const { revision, values } = await readBuildRequest(request);
      const project = await sources.prepared(revision);
      const errors = validateSelection(project.schema, values);
      if (errors.length) throw new FirmwareError(errors.join("\n"));
      const selection = values as Selection;
      const key = await buildKey(revision, generateConfig(project.source, project.schema, selection));
      const result = await cachedBuild(env.BUILD_CACHE, key) ?? await compile({ key, revision, values: selection });
      return Response.json(result, { headers: { ...headers, "X-Firmware-Cache": result.cached ? "HIT" : "MISS" } });
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof FirmwareError)
      return Response.json({ error: error.message, ...(error.log ? { log: error.log } : {}) }, { status: error.status, headers });
    console.error("Firmware service failed", error);
    return Response.json({ error: "The firmware service could not complete this request. Please try again." }, { status: 502, headers });
  }
}
