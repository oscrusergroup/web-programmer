import { test } from "node:test";
import assert from "node:assert/strict";
import type { SerialPort } from "../src/lib/serial/web-serial";
import { clockSeconds, describeDrift, parseClockReply, setTimeCommand } from "../src/lib/serial/oscr-time";
import { openSerialMonitor, PREAMBLE_HOLD_MS, SerialTextDecoder, type LineEnding } from "../src/lib/serial/monitor";

function device() {
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  const sent: Uint8Array[] = [];
  let closed = 0;
  let baud = 0;
  const readable = new ReadableStream<Uint8Array>({ start(controller) { incoming = controller; } });
  const writable = new WritableStream<Uint8Array>({ write(bytes) { sent.push(bytes); } });
  const port: SerialPort = {
    readable, writable,
    async open(options) { baud = options.baudRate; },
    async close() {
      assert.equal(readable.locked, false);
      assert.equal(writable.locked, false);
      closed++;
    },
    async setSignals() { throw new Error("The monitor must not run the uploader reset sequence"); },
    getInfo() { return {}; },
  };
  return { port, sent, incoming: () => incoming, closed: () => closed, baud: () => baud };
}

test("monitor decodes UTF-8 across serial chunks and releases the port while reading", async () => {
  const target = device();
  const text: string[] = [];
  const received = Promise.withResolvers<void>();
  const monitor = await openSerialMonitor(target.port, 9600, chunk => {
    text.push(chunk);
    if (text.join("") === "Ready ✓\n") received.resolve();
  }, () => assert.fail("An intentional close is not a disconnect error"));
  try {
    target.incoming().enqueue(Uint8Array.from([82, 101, 97, 100, 121, 32, 0xe2]));
    target.incoming().enqueue(Uint8Array.from([0x9c, 0x93, 10]));
    await received.promise;
    assert.equal(target.baud(), 9600);
    assert.equal(text.join(""), "Ready ✓\n");
    await Promise.all([monitor.close(), monitor.close()]);
    assert.equal(target.closed(), 1);
    await assert.rejects(monitor.send("0", "none"), /connect/i);
  } finally { await monitor.close(); }
});

test("monitor sends the exact selected line ending, including a single space command", async () => {
  const target = device();
  const monitor = await openSerialMonitor(target.port, 115200, () => {}, () => {});
  try {
    for (const ending of ["none", "lf", "cr", "crlf"] as LineEnding[])
      await monitor.send("u", ending);
    await monitor.send(" ", "none");
    assert.deepEqual(target.sent.map(bytes => [...bytes]), [
      [117], [117, 10], [117, 13], [117, 13, 10], [32],
    ]);
  } finally { await monitor.close(); }
});

test("device disconnect closes its streams and reports the error once", async () => {
  const target = device();
  const disconnected = Promise.withResolvers<Error>();
  let reports = 0;
  const monitor = await openSerialMonitor(target.port, 9600, () => {}, error => {
    reports++;
    disconnected.resolve(error);
  });
  target.incoming().error(new Error("USB cable removed"));
  assert.match((await disconnected.promise).message, /USB cable removed/);
  assert.equal(target.closed(), 1);
  assert.equal(reports, 1);
  await monitor.close();
  assert.equal(target.closed(), 1);
});

test("monitor closes an opened port if the streams are unavailable", async () => {
  const target = device();
  target.port.readable = null;
  await assert.rejects(openSerialMonitor(target.port, 9600, () => {}, () => {}), /read or written/);
  assert.equal(target.closed(), 1);
});

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap(part => typeof part === "string" ? [...new TextEncoder().encode(part)] : part));

test("decoder drops reset noise ahead of the first line", () => {
  const decoder = new SerialTextDecoder();
  assert.equal(decoder.push(bytes([0xf8, 0x00, 0xfe, 0x86])), "");
  assert.equal(decoder.push(bytes("OSCR::15.4//HW5")), "");
  assert.equal(decoder.holding, true);
  assert.equal(decoder.push(bytes("\r\n0) Game Boy\r\n")), "OSCR::15.4//HW5\n0) Game Boy\n");
  // Only the first line is cleaned; later invalid bytes stay visible as U+FFFD.
  assert.equal(decoder.push(bytes([0xff], "x\n")), "�x\n");
});

test("decoder releases a first line without a line break", () => {
  const decoder = new SerialTextDecoder();
  assert.equal(decoder.push(bytes([0x00, 0xff], "> ")), "");
  assert.equal(decoder.release(), "> ");
  assert.equal(decoder.holding, false);
  assert.equal(decoder.push(bytes("ok\n")), "ok\n");
});

test("decoder normalizes CRLF, lone CR and CRLF split across reads", () => {
  const decoder = new SerialTextDecoder();
  decoder.release();
  assert.equal(decoder.push(bytes("a\r\nb\rc\r")), "a\nb\nc\n");
  assert.equal(decoder.push(bytes("\nd\n\r\n")), "d\n\n");
  assert.equal(decoder.push(bytes("tab\there", [0x07, 0x00], "!\n")), "tab\there!\n");
});

test("monitor shows a held first line after the hold timeout", async () => {
  const target = device();
  const text: string[] = [];
  const received = Promise.withResolvers<void>();
  const monitor = await openSerialMonitor(target.port, 9600, chunk => {
    text.push(chunk);
    received.resolve();
  }, () => {});
  try {
    target.incoming().enqueue(bytes([0xf8, 0x00], "Select: "));
    const started = Date.now();
    await received.promise;
    assert.ok(Date.now() - started >= PREAMBLE_HOLD_MS - 20);
    assert.deepEqual(text, ["Select: "]);
  } finally { await monitor.close(); }
});

test("OSCR clock helpers build commands and read the firmware's time stamp", () => {
  assert.equal(setTimeCommand(1689468590), "SETTIME 1689468590");
  assert.throws(() => setTimeCommand(-1), RangeError);
  assert.equal(clockSeconds(1_700_000_000_400, "utc"), 1_700_000_000);
  const now = Date.UTC(2026, 9, 15, 17, 30, 5);
  assert.equal(clockSeconds(now, "local"), now / 1000 - new Date(now).getTimezoneOffset() * 60);
  assert.equal(parseClockReply("Current Time: 15Oct2026 05:30:05PM"), Date.UTC(2026, 9, 15, 17, 30, 5) / 1000);
  assert.equal(parseClockReply("Current Time: 01Jan2026 12:00:00AM"), Date.UTC(2026, 0, 1, 0, 0, 0) / 1000);
  assert.equal(parseClockReply("Current Time: 01Jan2026 12:00:00PM"), Date.UTC(2026, 0, 1, 12, 0, 0) / 1000);
  assert.equal(parseClockReply("OSCR: Unknown Command"), undefined);
  assert.equal(describeDrift(0), "matches this computer");
  assert.equal(describeDrift(-150), "3 minutes behind this computer");
  assert.equal(describeDrift(18000), "5 hours ahead of this computer");
});
