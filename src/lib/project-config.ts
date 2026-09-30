import { parseConfig, HARDWARE, CORE_SECTION } from "./config";
import { FirmwareError } from "./errors";
import type { FirmwareProject } from "./firmware";

export function projectFromSource(source: string, cpp: string, revision: string): FirmwareProject {
  const schema = parseConfig(source);
  if (!schema.some(o => HARDWARE.includes(o.key)) || !schema.some(o => o.section === CORE_SECTION))
    throw new FirmwareError("This release uses an older Config.h format that this programmer does not support. Choose a newer release.", 422);
  return { source, schema, revision, version: cpp.match(/FSTRING_VERSION\[\]\s*=\s*"([^"]+)"/)?.[1] ?? "Selected firmware" };
}
