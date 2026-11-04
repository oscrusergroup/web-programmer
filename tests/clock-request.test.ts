import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { SerialPort } from "../src/lib/serial/web-serial";
import { openSerialMonitor } from "../src/lib/serial/monitor";
import { parseClockReply } from "../src/lib/serial/oscr-time";
import { finishClockRequest, sendClockRequest, type ClockRequest } from "../src/lib/serial/clock-request";

const TIMEOUT_MS = 4000;

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const slot: { current: ClockRequest | null } = { current: null };
  const timeouts: string[] = [];
  let stale = false;
  const send = (name: string, kind: "check" | "set", write: () => Promise<void>) =>
    sendClockRequest(slot, { kind, zone: "utc" }, {
      timeoutMs: TIMEOUT_MS,
      onTimeout: () => timeouts.push(name),
      isStale: () => stale,
    }, write);
  return { slot, timeouts, send, markStale: () => { stale = true; } };
}

/** A serial port whose writes stay pending until `finishWrite` is called. */
function slowDevice() {
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  const writeStarted = Promise.withResolvers<void>();
  const writeDone = Promise.withResolvers<void>();
  const port: SerialPort = {
    readable: new ReadableStream<Uint8Array>({ start(controller) { incoming = controller; } }),
    writable: new WritableStream<Uint8Array>({
      write() {
        writeStarted.resolve();
        return writeDone.promise;
      },
    }),
    async open() {},
    async close() {},
    async setSignals() {},
    getInfo() { return {}; },
  };
  return { port, reply: (line: string) => incoming.enqueue(new TextEncoder().encode(line)), writeStarted, finishWrite: () => writeDone.resolve() };
}

test("a reply that arrives before the serial write resolves is matched and never times out", async t => {
  const { slot, timeouts, send } = setup(t);
  const target = slowDevice();
  const replied = Promise.withResolvers<void>();
  const answered: string[] = [];
  const monitor = await openSerialMonitor(target.port, 9600, text => {
    // What the component's reply watcher does: only a registered request can take a reply.
    const request = slot.current;
    if (request && parseClockReply(text) !== undefined) {
      answered.push(request.kind);
      finishClockRequest(slot);
    }
    replied.resolve();
  }, () => {});
  try {
    const sending = send("check", "check", () => monitor.send("GETTIME", "lf"));
    await target.writeStarted.promise;
    target.reply("Current Time: 15Oct2026 12:30:05PM\n");
    await replied.promise;
    target.finishWrite();
    await sending;

    t.mock.timers.tick(TIMEOUT_MS);
    assert.deepEqual(answered, ["check"]);
    assert.deepEqual(timeouts, []);
    assert.equal(slot.current, null);
  } finally {
    target.finishWrite();
    await monitor.close();
  }
});

test("an unanswered request times out once the reply window ends, not before", async t => {
  const { slot, timeouts, send } = setup(t);
  await send("check", "check", async () => {});
  assert.equal(slot.current?.kind, "check");

  t.mock.timers.tick(TIMEOUT_MS - 1);
  assert.deepEqual(timeouts, []);
  t.mock.timers.tick(1);
  assert.deepEqual(timeouts, ["check"]);
  assert.equal(slot.current, null);
});

test("a stalled write still reports the timeout", async t => {
  const { slot, timeouts, send } = setup(t);
  void send("check", "check", () => new Promise<void>(() => {}));

  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(timeouts, ["check"]);
  assert.equal(slot.current, null);
});

test("a failed write clears its request, reports the failure, and leaves no timeout behind", async t => {
  const { slot, timeouts, send } = setup(t);
  await assert.rejects(send("check", "check", async () => { throw new Error("Write failed"); }), /Write failed/);

  assert.equal(slot.current, null);
  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(timeouts, []);
});

test("a stale write failure is ignored and leaves the newer request pending", async t => {
  const { slot, timeouts, send, markStale } = setup(t);
  const older = Promise.withResolvers<void>();
  const olderSend = send("older", "check", () => older.promise);

  markStale();
  void send("newer", "set", () => new Promise<void>(() => {}));
  const newer = slot.current;
  older.reject(new Error("Port closed"));
  await olderSend;

  assert.equal(slot.current, newer);
  assert.equal(slot.current?.kind, "set");
  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(timeouts, ["newer"]);
});

test("a stale write failure after disconnect reports nothing", async t => {
  const { slot, timeouts, send, markStale } = setup(t);
  const write = Promise.withResolvers<void>();
  const sending = send("check", "check", () => write.promise);

  finishClockRequest(slot);
  markStale();
  write.reject(new Error("Port closed"));
  await sending;

  assert.equal(slot.current, null);
  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(timeouts, []);
});

test("finishing an older request does not end the newer one", async t => {
  const { slot, timeouts, send } = setup(t);
  void send("older", "check", () => new Promise<void>(() => {}));
  const older = slot.current!;
  void send("newer", "set", () => new Promise<void>(() => {}));
  const newer = slot.current;

  finishClockRequest(slot, older);
  assert.equal(slot.current, newer);
  t.mock.timers.tick(TIMEOUT_MS);
  assert.deepEqual(timeouts, ["newer"]);
});
