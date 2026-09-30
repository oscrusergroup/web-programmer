import path from "node:path";
import firmwareSource from "../../firmware-source.mjs";

export { firmwareSource };
export function firmwareCacheRoot() {
  return process.env.FIRMWARE_CACHE_DIR || path.join(process.cwd(), ".firmware-cache");
}
export function firmwareDirectory() {
  return path.join(firmwareCacheRoot(), "cartreader");
}
export function firmwareSketchPath() {
  return path.join(firmwareDirectory(), firmwareSource.sketch);
}
