import type { FirmwareRelease } from "./firmware";

export function isSupportedRelease(release: Pick<FirmwareRelease, "tag">): boolean {
  const version = /^v(\d+)(?:[.-]|$)/i.exec(release.tag);
  return version !== null && Number(version[1]) >= 15;
}
