import type { ConfigOption } from "./config";

export type FirmwareRelease = {
  id: string;
  tag: string;
  label: string;
  prerelease: boolean;
};
export type FirmwareProject = {
  source: string;
  schema: ConfigOption[];
  version: string;
  revision: string;
};

export type BuildResult = {
  hex: string;
  log: string;
  config: string;
  flashBytes: number;
  ramBytes: number;
  fingerprint: string;
  duration: number;
  version: string;
  revision: string;
  cached?: boolean;
  cacheKey?: string;
  builtAt?: string;
};
