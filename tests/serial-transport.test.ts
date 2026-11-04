import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SerialTransport,
  serialSupported,
  uploadFirmware,
  type SerialPort,
} from "../src/lib/serial/web-serial";
import { encodeFrame, SerialTimeoutError } from "../src/lib/serial/stk500v2";

test("serial reader buffers partial packets and bytes arriving before a read", async () => {
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      incoming = controller;
    },
  });
  const sent: number[] = [];
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      sent.push(...chunk);
    },
  });
  const transport = new SerialTransport(stream.getReader(), output.getWriter());
  incoming.enqueue(new Uint8Array([1, 2]));
  const result = transport.readExact(4, 100);
  incoming.enqueue(new Uint8Array([3, 4, 5]));
  assert.deepEqual([...(await result)], [1, 2, 3, 4]);
  assert.deepEqual([...(await transport.readExact(1, 100))], [5]);
  await transport.write(new Uint8Array([6, 7]));
  assert.deepEqual(sent, [6, 7]);
  await assert.rejects(transport.readExact(1, 10), SerialTimeoutError);
  incoming.close();
  await assert.rejects(transport.readExact(1, 100), /disconnected/);
  await transport.close();
  assert.equal(stream.locked, false);
  assert.equal(output.locked, false);
});

test("invalid firmware is rejected before the user's serial port is opened", async () => {
  let opened = false;
  const port = {
    open: async () => {
      opened = true;
    },
  } as unknown as SerialPort;
  await assert.rejects(
    uploadFirmware(port, "invalid", () => {}),
    /Intel HEX/,
  );
  assert.equal(opened, false);
});

test("releases reset before contacting the bootloader and closes the port on failure", async () => {
  let resetAsserted = true;
  let assertionSeen = false;
  let contacted = false;
  let closed = false;
  const readable = new ReadableStream<Uint8Array>();
  const writable = new WritableStream<Uint8Array>({
    write() {
      contacted = true;
      assert.equal(assertionSeen, true, "reset must be pulsed before sign-on");
      assert.equal(resetAsserted, false, "asserted DTR/RTS can hold the board in reset");
      throw new Error("Simulated USB write failure");
    },
  });
  const port: SerialPort = {
    readable,
    writable,
    async open() {},
    async close() { closed = true; },
    async setSignals(signals) {
      resetAsserted = signals.dataTerminalReady || signals.requestToSend;
      if (resetAsserted) assertionSeen = true;
    },
    getInfo() { return {}; },
  };
  await assert.rejects(
    uploadFirmware(port, ":0400000001020304F2\n:00000001FF", () => {}),
    /Simulated USB write failure/,
  );
  assert.equal(contacted, true);
  assert.equal(closed, true);
  assert.equal(readable.locked, false);
  assert.equal(writable.locked, false);
});

test("uploads over serial streams when the first sign-on is lost during reset", async () => {
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  let signOns = 0;
  let resetAsserted = false;
  let closed = false;
  const flash = new Uint8Array(256).fill(255);
  const phases: string[] = [];
  const readable = new ReadableStream<Uint8Array>({
    start(controller) { incoming = controller; },
  });
  const writable = new WritableStream<Uint8Array>({
    write(frame) {
      assert.equal(resetAsserted, false);
      assert.equal(frame.reduce((a, b) => a ^ b, 0), 0);
      const body = frame.slice(5, -1);
      let response = [body[0], 0];
      switch (body[0]) {
        case 1:
          assert.equal(frame[1], 1);
          if (++signOns === 1) return; // Board is still starting up.
          response.push(8, ...new TextEncoder().encode("AVRISP_2"));
          break;
        case 0x1b:
          response.push([0x1e, 0x98, 0x01][body[4]], 0);
          break;
        case 0x13:
          flash.set(body.slice(10));
          break;
        case 0x14:
          response.push(...flash, 0);
          break;
        default:
          assert.ok([6, 0x10, 0x11].includes(body[0]));
      }
      const reply = encodeFrame(frame[1], Uint8Array.from(response));
      incoming.enqueue(reply.slice(0, 4));
      incoming.enqueue(reply.slice(4));
    },
  });
  const port: SerialPort = {
    readable, writable,
    async open(options) { assert.equal(options.baudRate, 115200); },
    async close() { closed = true; },
    async setSignals(signals) {
      resetAsserted = signals.dataTerminalReady || signals.requestToSend;
    },
    getInfo() { return {}; },
  };
  await uploadFirmware(port, ":0400000001020304F2\n:00000001FF", phase => phases.push(phase));
  assert.equal(signOns, 2);
  assert.deepEqual([...flash.slice(0, 4)], [1, 2, 3, 4]);
  assert.equal(phases.at(-1), "Upload verified");
  assert.equal(closed, true);
  assert.equal(readable.locked, false);
  assert.equal(writable.locked, false);
});

test("serial support needs both the Web Serial API and a secure context", (t) => {
  t.after(() => {
    Reflect.deleteProperty(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "window");
  });
  const browser = (serial: object | undefined, isSecureContext: boolean) => {
    Object.defineProperty(globalThis, "navigator", { value: { serial }, configurable: true });
    Object.defineProperty(globalThis, "window", { value: { isSecureContext }, configurable: true });
  };

  browser({}, true);
  assert.equal(serialSupported(), true);
  browser(undefined, true);
  assert.equal(serialSupported(), false);
  browser({}, false);
  assert.equal(serialSupported(), false);
});
