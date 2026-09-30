import { MAX_FLASH } from "./hex";
export interface ByteTransport {
  write(data: Uint8Array): Promise<void>;
  readExact(length: number, timeoutMs?: number): Promise<Uint8Array>;
}
export type FlashProgress = (phase: string, percent: number) => void;
export function encodeFrame(sequence: number, body: Uint8Array): Uint8Array {
  const frame = new Uint8Array(body.length + 6);
  frame.set([0x1b, sequence & 255, body.length >> 8, body.length & 255, 0x0e]);
  frame.set(body, 5);
  frame[frame.length - 1] = frame.slice(0, -1).reduce((a, b) => a ^ b, 0);
  return frame;
}

export async function flashMega(
  transport: ByteTransport,
  image: Uint8Array,
  progress: FlashProgress = () => {},
) {
  if (!image.length || image.length > MAX_FLASH || image.length % 256)
    throw new Error("Invalid Mega 2560 flash image.");
  let sequence = 0;
  async function command(body: number[] | Uint8Array): Promise<Uint8Array> {
    sequence = (sequence + 1) & 255;
    await transport.write(encodeFrame(sequence, Uint8Array.from(body)));
    // A running sketch can leave a little serial output in the input buffer.
    let start = 0;
    for (let i = 0; i < 1024; i++) {
      start = (await transport.readExact(1))[0];
      if (start === 0x1b) break;
    }
    if (start !== 0x1b)
      throw new Error("Bootloader did not send an STK500v2 frame.");
    const header = await transport.readExact(4);
    const length = (header[1] << 8) | header[2];
    if (
      header[0] !== sequence ||
      header[3] !== 0x0e ||
      length < 2 ||
      length > 1024
    )
      throw new Error("Invalid bootloader response header.");
    const tail = await transport.readExact(length + 1);
    if ([start, ...header, ...tail].reduce((a, b) => a ^ b, 0) !== 0)
      throw new Error("Bootloader response checksum mismatch.");
    if (tail[0] !== body[0] || tail[1] !== 0)
      throw new Error(
        `Bootloader rejected command 0x${body[0].toString(16)} (status ${tail[1]}).`,
      );
    return tail.slice(0, -1);
  }
  async function address(byteAddress: number) {
    const word = byteAddress / 2;
    await command([
      6,
      (word >>> 24) & 255,
      (word >>> 16) & 255,
      (word >>> 8) & 255,
      word & 255,
    ]);
  }
  progress("Checking bootloader", 0);
  await command([1]);
  const signature = [];
  for (let i = 0; i < 3; i++)
    signature.push((await command([0x1b, 0, 0x30, 0, i, 0]))[2]);
  if (signature.join() !== [0x1e, 0x98, 1].join())
    throw new Error(
      "The connected device is not an ATmega2560. Select an Arduino Mega 2560.",
    );
  await command([0x10, 200, 100, 25, 32, 0, 0x53, 3, 0xac, 0x53, 0, 0]);
  // Mega bootloader erases each page during PROGRAM_FLASH_ISP. CHIP_ERASE and
  // SET_DEVICE_DESCRIPTOR are not supported by the stock Arduino bootloader.
  for (let offset = 0; offset < image.length; offset += 256) {
    await address(offset);
    await command(
      Uint8Array.from([
        0x13,
        1,
        0,
        0xc1,
        10,
        0x40,
        0x4c,
        0x20,
        0,
        0,
        ...image.slice(offset, offset + 256),
      ]),
    );
    progress(
      "Writing firmware",
      Math.round(((offset + 256) / image.length) * 65),
    );
  }
  for (let offset = 0; offset < image.length; offset += 256) {
    await address(offset);
    const response = await command([0x14, 1, 0, 0x20]);
    if (response.length !== 259 || response[258] !== 0)
      throw new Error("Incomplete flash verification response.");
    for (let i = 0; i < 256; i++)
      if (response[i + 2] !== image[offset + i])
        throw new Error(
          `Flash verification failed at address 0x${(offset + i).toString(16)}. Reconnect and upload again.`,
        );
    progress(
      "Verifying firmware",
      65 + Math.round(((offset + 256) / image.length) * 34),
    );
  }
  await command([0x11, 1, 1]);
  progress("Upload verified", 100);
}
