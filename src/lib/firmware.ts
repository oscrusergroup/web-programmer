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
