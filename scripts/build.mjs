import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// OpenNext invokes this build again with CARTREADER_NEXT_BUILD=1.
// Only the outer Workers Builds invocation should start the adapter.
const cloudflareBuild = process.env.WORKERS_CI === "1" && process.env.CARTREADER_NEXT_BUILD !== "1";
const entrypoint = cloudflareBuild
  ? fileURLToPath(new URL("./cloudflare.mjs", import.meta.url))
  : createRequire(import.meta.url).resolve("next/dist/bin/next");
const args = cloudflareBuild ? ["build"] : ["build", "--webpack", ...process.argv.slice(2)];
const child = spawn(process.execPath, [entrypoint, ...args], { stdio: "inherit", env: process.env });
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
