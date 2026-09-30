import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SerialTransport,
  uploadFirmware,
  type SerialPort,
} from "../src/lib/serial/web-serial";

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
  await assert.rejects(transport.readExact(1, 10), /timed out/);
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
