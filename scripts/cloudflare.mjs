import { spawn } from "node:child_process";
const command = process.argv[2] ?? "build";
const commands = {
  build: ["opennextjs-cloudflare", "build"],
  preview: ["opennextjs-cloudflare", "preview"],
  deploy: ["opennextjs-cloudflare", "deploy"],
};
if (!commands[command]) throw new Error("Unknown Cloudflare command.");
const [binary, ...args] = commands[command];
const child = spawn(process.platform === "win32" ? `${binary}.cmd` : binary, args, {
  stdio: "inherit", shell: process.platform === "win32", env: {
    ...process.env, FIRMWARE_BACKEND: "cloudflare",
    ...(command === "build" ? { CARTREADER_NEXT_BUILD: "1" } : {}),
  },
});
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
