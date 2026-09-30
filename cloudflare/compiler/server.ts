import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import path from "node:path";
import { firmwareCacheRoot, firmwareSource } from "../../src/lib/firmware-path.mjs";
import { setupFirmware } from "../../scripts/setup-firmware.mjs";
import { prepareProject } from "../../src/lib/server/project";
import { compile, BuildError, compilerReady } from "../../src/lib/server/compiler";
import { FirmwareError } from "../../src/lib/errors";
import { generateConfig, type Selection } from "../../src/lib/config";
import { readBuildRequest } from "../../src/lib/build-request";
import { buildKey, TOOLCHAIN_ID } from "../build-cache";

createServer(async (req, res) => {
  const reply = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === "GET" && req.url === "/health") {
      reply(200, { ready: await compilerReady(), toolchain: TOOLCHAIN_ID });
      return;
    }
    if (req.method !== "POST" || req.url !== "/compile") { reply(404, { error: "Not found." }); return; }
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) { reply(413, { error: "Configuration is too large." }); return; }
      parts.push(chunk);
    }
    const body = Buffer.concat(parts).toString("utf8");
    const payload = JSON.parse(body);
    if (payload.toolchain !== TOOLCHAIN_ID)
      throw new FirmwareError("Compiler toolchain mismatch. Deploy the website and firmware service from the same version.", 409);
    const { revision, values } = await readBuildRequest(new Request("http://compiler/compile", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
    const directory = path.join(firmwareCacheRoot(), "revisions", revision);
    await setupFirmware({ source: { ...firmwareSource, ref: revision }, destination: directory, refreshCached: false });
    const project = await prepareProject(directory);
    if (project.revision !== revision) throw new FirmwareError("The downloaded revision did not match the selected source.", 502);
    const key = await buildKey(revision, generateConfig(project.source, project.schema, values as Selection));
    if (key !== payload.key) throw new FirmwareError("The build configuration did not match its cache key.");
    reply(200, await compile(values as Selection, revision));
  } catch (error) {
    if (error instanceof FirmwareError || error instanceof BuildError) reply(error.status, { error: error.message, log: error.log });
    else if (error instanceof SyntaxError) reply(400, { error: "Invalid JSON configuration." });
    else { console.error("Compiler service failed", error); reply(502, { error: "Could not prepare or compile this firmware. Please try again." }); }
  }
}).listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.log("Firmware compiler listening"));
