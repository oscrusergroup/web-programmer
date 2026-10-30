import { readPreset, type Preset } from "../lib/presets";
import cartreaderNetNew from "./cartreader-net-new.json";

// Built-in presets, in dropdown order. Each entry's id is its ?preset= value
// and its file is an exported preset, e.g.:
//   import snesN64 from "./snes-n64.json";
//   ["snes-n64", snesN64],
const files: [id: string, file: unknown][] = [
  ["cartreader-net-new", cartreaderNetNew],
];

export const BUILT_IN_PRESETS: Preset[] = files.map(([id, file]) => ({
  ...readPreset(file),
  id,
  builtIn: true,
}));
