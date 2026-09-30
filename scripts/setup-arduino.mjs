import { mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const toolchain = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../toolchain.json", import.meta.url), "utf8"));
const version = toolchain.cli;
const targets = {
  "darwin-arm64": "macOS_ARM64",
  "darwin-x64": "macOS_64bit",
  "linux-x64": "Linux_64bit",
  "linux-arm64": "Linux_ARM64",
  "win32-x64": "Windows_64bit",
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target)
  throw new Error(
    "Install Arduino CLI manually and set ARDUINO_CLI_PATH for this platform.",
  );
const tools = path.join(root, ".tools"),
  state = path.join(root, ".arduino");
await mkdir(tools, { recursive: true });
await mkdir(state, { recursive: true });
await rm(path.join(state, "ready.json"), { force: true });
const archive = `arduino-cli_${version}_${target}.${process.platform === "win32" ? "zip" : "tar.gz"}`;
const base = `https://github.com/arduino/arduino-cli/releases/download/v${version}`;
async function download(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
console.log(`Installing Arduino CLI ${version} for ${target}…`);
const [data, checksums] = await Promise.all([
  download(`${base}/${archive}`),
  download(`${base}/${version}-checksums.txt`),
]);
const expected = checksums
  .toString()
  .split("\n")
  .find((line) => line.endsWith(archive))
  ?.split(/\s+/)[0];
if (!expected || createHash("sha256").update(data).digest("hex") !== expected)
  throw new Error("Arduino CLI checksum mismatch.");
await writeFile(path.join(tools, archive), data);
execFileSync("tar", ["-xf", path.join(tools, archive), "-C", tools]);
const cli = path.join(
  tools,
  process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli",
);
if (process.platform !== "win32") await chmod(cli, 0o755);
await writeFile(
  path.join(state, "arduino-cli.yaml"),
  JSON.stringify({
    directories: {
      data: path.join(state, "data"),
      downloads: path.join(state, "downloads"),
      user: path.join(state, "user"),
    },
  }),
);
const run = (args) =>
  execFileSync(
    cli,
    ["--config-file", path.join(state, "arduino-cli.yaml"), ...args],
    { stdio: "inherit" },
  );
run(["core", "update-index"]);
run(["core", "install", toolchain.core]);
run(["lib", "update-index"]);
const libraries = toolchain.libraries;
run(["lib", "install", ...libraries]);
await writeFile(
  path.join(state, "ready.json"),
  JSON.stringify(
    { cli: version, core: toolchain.core, libraries },
    null,
    2,
  ),
);
await rm(path.join(tools, archive));
console.log("Compiler ready. Run pnpm run dev to open the web programmer.");
