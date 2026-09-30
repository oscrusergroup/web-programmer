export const MAX_FLASH = 253952; // 256 KiB minus the Mega's 8 KiB bootloader.
export function parseHex(hex: string): Uint8Array {
  const flash = new Uint8Array(MAX_FLASH).fill(255);
  let base = 0,
    end = 0,
    eof = false;
  for (const raw of hex.trim().split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (eof) throw new Error("HEX contains records after end-of-file.");
    if (!/^:(?:[0-9a-fA-F]{2})+$/.test(line))
      throw new Error("Invalid Intel HEX record.");
    const bytes = Uint8Array.from(line.slice(1).match(/../g)!, (v) =>
      parseInt(v, 16),
    );
    if (bytes.length !== bytes[0] + 5)
      throw new Error("HEX record length mismatch.");
    if (bytes.reduce((a, b) => a + b, 0) % 256 !== 0)
      throw new Error("HEX checksum mismatch.");
    const address = (bytes[1] << 8) | bytes[2],
      type = bytes[3],
      data = bytes.slice(4, -1);
    if (type === 0) {
      const offset = base + address;
      if (offset + data.length > MAX_FLASH)
        throw new Error("Firmware overlaps the Mega 2560 bootloader.");
      flash.set(data, offset);
      end = Math.max(end, offset + data.length);
    } else if (type === 1 && data.length === 0 && address === 0) eof = true;
    else if ((type === 2 || type === 4) && data.length === 2 && address === 0)
      base = ((data[0] << 8) | data[1]) * (type === 2 ? 16 : 65536);
    else if ((type === 3 || type === 5) && data.length === 4) {
      /* Start address is unused by the AVR bootloader. */
    } else throw new Error(`Unsupported or invalid HEX record type ${type}.`);
  }
  if (!eof) throw new Error("HEX is missing its end-of-file record.");
  if (!end) throw new Error("Firmware contains no flash data.");
  return flash.slice(0, Math.ceil(end / 256) * 256);
}
