import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHex, MAX_FLASH } from "../src/lib/serial/hex";
import {
  encodeFrame,
  flashMega,
  SerialTimeoutError,
  type ByteTransport,
} from "../src/lib/serial/stk500v2";

function record(address: number, type: number, data: number[]) {
  const bytes = [data.length, address >> 8, address & 255, type, ...data];
  bytes.push(-bytes.reduce((a, b) => a + b, 0) & 255);
  return (
    ":" +
    bytes
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
const hex = [
  record(0, 0, [1, 2, 3, 4]),
  record(0, 4, [0, 2]),
  record(0, 0, [5, 6, 7, 8]),
  record(0, 1, []),
].join("\n");
class Bootloader implements ByteTransport {
  memory = new Uint8Array(MAX_FLASH).fill(255);
  pending: number[] = [];
  address = 0;
  writes = 0;
  commands: number[] = [];
  wrongSignature = false;
  corruptReadback = false;
  corruptChecksum = false;
  async write(frame: Uint8Array) {
    assert.equal(
      frame.reduce((a, b) => a ^ b, 0),
      0,
    );
    const b = frame.slice(5, -1),
      command = b[0];
    this.commands.push(command);
    let response = [command, 0];
    if (command === 1)
      response.push(8, ...new TextEncoder().encode("AVRISP_2"));
    else if (command === 0x1b)
      response.push(
        (this.wrongSignature ? [0, 0, 0] : [0x1e, 0x98, 0x01])[b[4]],
        0,
      );
    else if (command === 6)
      this.address =
        (((b[1] << 24) >>> 0) + (b[2] << 16) + (b[3] << 8) + b[4]) * 2;
    else if (command === 0x13) {
      this.memory.set(b.slice(10), this.address);
      this.writes++;
    } else if (command === 0x14) {
      response.push(
        ...this.memory.slice(this.address, this.address + ((b[1] << 8) | b[2])),
        0,
      );
      if (this.corruptReadback) response[2] ^= 1;
    } else
      assert.ok(
        [0x10, 0x11].includes(command),
        `Unsupported Mega bootloader command ${command}`,
      );
    const reply = encodeFrame(frame[1], new Uint8Array(response));
    if (this.corruptChecksum) reply[reply.length - 1] ^= 1;
    this.pending.push(...reply);
  }
  async readExact(length: number) {
    if (this.pending.length < length) throw new Error("Timed out");
    return Uint8Array.from(this.pending.splice(0, length));
  }
}
test("synchronizes when the bootloader misses the first two sign-on requests", async () => {
  class StartingBootloader extends Bootloader {
    signOns = 0;
    override async write(frame: Uint8Array) {
      if (frame[5] === 1) {
        assert.equal(frame[1], 1, "older Mega bootloaders need sign-on sequence 1");
        if (++this.signOns <= 2) return;
      }
      await super.write(frame);
    }
    override async readExact(length: number) {
      if (this.pending.length < length) throw new SerialTimeoutError();
      return super.readExact(length);
    }
  }
  const target = new StartingBootloader();
  await flashMega(target, new Uint8Array(256).fill(42));
  assert.equal(target.signOns, 3);
  assert.deepEqual([...target.memory.slice(0, 4)], [42, 42, 42, 42]);
  assert.equal(target.commands.at(-1), 0x11);
});

test("ignores a delayed duplicate sign-on response before checking the MCU", async () => {
  class DuplicateBootloader extends Bootloader {
    override async write(frame: Uint8Array) {
      await super.write(frame);
      if (frame[5] === 1) this.pending.push(...this.pending);
    }
  }
  const target = new DuplicateBootloader();
  await flashMega(target, new Uint8Array(256).fill(42));
  assert.equal(target.writes, 1);
});

test("stops synchronization after bounded retries without writing flash", async () => {
  let requests = 0;
  const target: ByteTransport = {
    async write(frame) {
      assert.equal(frame[5], 1, "only sign-on is safe before synchronization");
      requests++;
    },
    async readExact() { throw new SerialTimeoutError(); },
  };
  await assert.rejects(flashMega(target, new Uint8Array(256)), /bootloader.*respond/i);
  assert.ok(requests > 1 && requests <= 10);
});

test("never retries a timed-out firmware write", async () => {
  class InterruptedBootloader extends Bootloader {
    override async write(frame: Uint8Array) {
      await super.write(frame);
      if (frame[5] === 0x13) this.pending = [];
    }
    override async readExact(length: number) {
      if (this.pending.length < length) throw new SerialTimeoutError();
      return super.readExact(length);
    }
  }
  const target = new InterruptedBootloader();
  await assert.rejects(flashMega(target, new Uint8Array(256)), /0x13.*timed out/i);
  assert.equal(target.writes, 1);
  assert.equal(target.commands.filter(command => command === 1).length, 1);
});
test("HEX parser supports extended addresses and fills gaps", () => {
  const image = parseHex(hex);
  assert.equal(image.length, 131328);
  assert.deepEqual([...image.slice(131072, 131076)], [5, 6, 7, 8]);
  assert.equal(image[1000], 255);
});
test("HEX parser rejects checksum corruption, missing EOF and bootloader writes", () => {
  assert.throws(
    () => parseHex(hex.replace("01020304", "01020305")),
    /checksum/i,
  );
  assert.throws(() => parseHex(record(0, 0, [1])), /end.of.file/i);
  assert.throws(
    () =>
      parseHex(
        [record(0, 4, [0, 3]), record(0xe000, 0, [1]), record(0, 1, [])].join(
          "\n",
        ),
      ),
    /bootloader/i,
  );
});
test("uploads and verifies across 128 KiB using Mega-supported commands", async () => {
  const target = new Bootloader();
  let progress = 0;
  await flashMega(target, parseHex(hex), (_phase, value) => {
    progress = value;
  });
  assert.equal(progress, 100);
  assert.deepEqual([...target.memory.slice(131072, 131076)], [5, 6, 7, 8]);
  assert.ok(target.commands.includes(0x14));
  assert.equal(target.commands.at(-1), 0x11);
});
test("rejects a different MCU before any flash writes", async () => {
  const target = new Bootloader();
  target.wrongSignature = true;
  await assert.rejects(flashMega(target, parseHex(hex)), /ATmega2560/);
  assert.equal(target.writes, 0);
});
test("fails readback and corrupt serial frames rather than reporting success", async () => {
  const target = new Bootloader();
  target.corruptReadback = true;
  await assert.rejects(flashMega(target, parseHex(hex)), /verification/i);
  const broken = new Bootloader();
  broken.corruptChecksum = true;
  await assert.rejects(flashMega(broken, parseHex(hex)), /checksum/i);
});
