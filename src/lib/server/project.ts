import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseConfig } from "../config";

export const sketchPath = path.join(
  process.cwd(),
  "arduino-code",
  "Cart_Reader",
);
export async function getProject() {
  const [source, cpp] = await Promise.all([
    readFile(path.join(sketchPath, "Config.h"), "utf8"),
    readFile(path.join(sketchPath, "OSCR.cpp"), "utf8"),
  ]);
  return {
    source,
    schema: parseConfig(source),
    version:
      cpp.match(/FSTRING_VERSION\[\]\s*=\s*"([^"]+)"/)?.[1] ?? "Local firmware",
  };
}
