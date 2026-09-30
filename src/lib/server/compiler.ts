import { cp, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateConfig, type Selection } from "../config";
import { getPreparedProject, preparedSketchPath } from "./project";
import { runCommand, CommandError } from "./run-command";

export const FQBN = "arduino:avr:mega:cpu=atmega2560";
const statePath = path.join(process.cwd(), ".arduino");
const cliPath =
  process.env.ARDUINO_CLI_PATH ||
  path.join(
    process.cwd(),
    ".tools",
    process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli",
  );
const compilerState = globalThis as typeof globalThis & {
  cartreaderBuilding?: boolean;
};
export class BuildError extends Error {
  constructor(
    message: string,
    public status = 500,
    public log = "",
  ) {
    super(message);
  }
}
export async function compilerReady() {
  try {
    await Promise.all([
      access(cliPath),
      access(path.join(statePath, "ready.json")),
    ]);
    return true;
  } catch {
    return false;
  }
}
export async function compile(values: Selection, revision: string) {
  const project = await getPreparedProject(revision);
  const sketchPath = preparedSketchPath(revision);
  const config = generateConfig(project.source, project.schema, values);
  if (!(await compilerReady()))
    throw new BuildError(
      "The server compiler is not installed. The host must run npm run setup:arduino.",
      503,
    );
  if (compilerState.cartreaderBuilding)
    throw new BuildError(
      "The compiler is busy with another build. Please try again shortly.",
      429,
    );
  compilerState.cartreaderBuilding = true;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(tmpdir(), "cartreader-"));
    const sketch = path.join(directory, "Cart_Reader"),
      output = path.join(directory, "output");
    await cp(sketchPath, sketch, { recursive: true });
    await writeFile(path.join(sketch, "Config.h"), config);
    const started = Date.now();
    const sanitize = (text: string) =>
      text
        .replaceAll(directory!, "[build]")
        .replaceAll(process.cwd(), "[project]");
    let log: string;
    try {
      log = sanitize(
        await runCommand(cliPath, [
          "--config-file",
          path.join(statePath, "arduino-cli.yaml"),
          "compile",
          "--fqbn",
          FQBN,
          "--jobs",
          "2",
          "--warnings",
          "default",
          "--output-dir",
          output,
          "--build-path",
          path.join(directory, "build"),
          sketch,
        ]),
      );
    } catch (error) {
      if (error instanceof CommandError)
        throw new BuildError(
          error.message.includes("time limit")
            ? "The build exceeded the four-minute limit. Try fewer game systems."
            : "Compilation failed. Review the build log below; try disabling unused cores if memory is full.",
          422,
          sanitize(error.output),
        );
      throw error;
    }
    const hex = await readFile(
      path.join(output, "Cart_Reader.ino.hex"),
      "utf8",
    );
    const flashBytes = Number(log.match(/Sketch uses (\d+) bytes/)?.[1] ?? 0);
    const ramBytes = Number(
      log.match(/Global variables use (\d+) bytes/)?.[1] ?? 0,
    );
    return {
      hex,
      log,
      config,
      flashBytes,
      ramBytes,
      duration: Date.now() - started,
      fingerprint: createHash("sha256")
        .update(revision).update(config)
        .digest("hex")
        .slice(0, 12),
      version: project.version,
      revision,
    };
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      compilerState.cartreaderBuilding = false;
    }
  }
}
