import { spawn } from "node:child_process";
const command = process.argv[2] ?? "build";
const commands = {
  build: ["opennextjs-cloudflare", "build"],
  preview: ["opennextjs-cloudflare", "preview"],
  deploy: ["opennextjs-cloudflare", "deploy"],
  "deploy-firmware": ["wrangler", "deploy", "--config", "wrangler.firmware.jsonc"],
};
if (!commands[command]) throw new Error("Unknown Cloudflare command.");
const [binary, ...args] = commands[command];
const env = {
  ...process.env, FIRMWARE_BACKEND: "cloudflare",
  ...(command === "build" ? { CARTREADER_NEXT_BUILD: "1" } : {}),
};
if (command === "deploy-firmware") {
  // Workers Builds sets these for the connected website Worker. The private
  // firmware Worker has its own name and tag; retain CI checks for web deploys.
  delete env.WRANGLER_CI_OVERRIDE_NAME;
  delete env.WRANGLER_CI_MATCH_TAG;
}
const child = spawn(process.platform === "win32" ? `${binary}.cmd` : binary, [...args, ...process.argv.slice(3)], {
  stdio: "inherit", shell: process.platform === "win32", env,
});
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
