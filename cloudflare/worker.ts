import { Container } from "@cloudflare/containers";
import { BuildCoordinator, TOOLCHAIN_ID, type BuildJob } from "./build-cache";
import { handleService } from "./service";
import { FirmwareSources, metadataReply, metadataValue } from "./sources";
import { FirmwareError } from "../src/lib/errors";
import type { BuildResult } from "../src/lib/firmware";

interface Env {
  BUILD_CACHE: R2Bucket;
  COMPILER: DurableObjectNamespace<CompilerContainer>;
  GITHUB_TOKEN?: string;
  APP_ORIGIN?: string;
}
export class CompilerContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m";
  enableInternet = true;
  private coordinator = new BuildCoordinator(this.env.BUILD_CACHE, async (job) => {
    const heartbeat = setInterval(() => this.renewActivityTimeout(), 60_000);
    try {
      const response = await this.containerFetch("http://compiler/compile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...job, toolchain: TOOLCHAIN_ID }),
      });
      const result = await response.json() as BuildResult & { error?: string };
      if (!response.ok) throw new FirmwareError(result.error || "Compilation failed.", response.status, result.log || "");
      if (result.revision !== job.revision || typeof result.hex !== "string")
        throw new FirmwareError("The compiler returned an invalid result.", 502);
      return result;
    } finally { clearInterval(heartbeat); }
  });
  private sources = new FirmwareSources(this.env.BUILD_CACHE, this.env.GITHUB_TOKEN);
  async build(job: BuildJob) {
    // RPC preserves plain data; return structured failures instead of relying on Error subclasses crossing isolates.
    try { return { ok: true as const, result: await this.coordinator.build(job) }; }
    catch (error) {
      if (error instanceof FirmwareError)
        return { ok: false as const, status: error.status, error: error.message, log: error.log };
      console.error("Compiler container failed", error);
      return { ok: false as const, status: 502, error: "The compiler could not complete this build. Please try again.", log: "" };
    }
  }
  firmwareReleases() { return metadataReply(() => this.sources.releases()); }
  firmwareProject(id?: string) { return metadataReply(() => this.sources.project(id)); }
}

export default {
  async fetch(request: Request, env: Env) {
    // This worker has no public route; only the website's service binding can invoke it.
    // One named object resolves metadata for every isolate. It never starts a container, so
    // compiler startup, which blocks its own object, cannot delay it.
    const metadata = env.COMPILER.get(env.COMPILER.idFromName("firmware-metadata"));
    return handleService(request, env, async job => {
      const reply = await env.COMPILER.get(env.COMPILER.idFromName("shared-compiler")).build(job);
      if (!reply.ok) throw new FirmwareError(reply.error, reply.status, reply.log);
      return reply.result;
    }, {
      releases: async () => metadataValue(await metadata.firmwareReleases()),
      project: async id => metadataValue(await metadata.firmwareProject(id)),
    });
  },
};
