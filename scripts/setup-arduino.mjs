import { mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const version = "1.3.1";
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
run(["core", "install", "arduino:avr@1.8.6"]);
run(["lib", "update-index"]);
const libraries = [
  "SdFat@2.3.0",
  "U8g2@2.36.19",
  "Adafruit NeoPixel@1.15.1",
  "RotaryEncoder@1.5.3",
  "Etherkit Si5351@2.2.0",
  "RTClib@2.1.4",
  "Adafruit BusIO@1.17.2",
  "FreqCount@1.3.0",
];
run(["lib", "install", ...libraries]);
await writeFile(
  path.join(state, "ready.json"),
  JSON.stringify(
    { cli: version, core: "arduino:avr@1.8.6", libraries },
    null,
    2,
  ),
);
await rm(path.join(tools, archive));
console.log("Compiler ready. Run npm run dev to open the web programmer.");
