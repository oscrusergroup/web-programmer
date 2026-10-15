import type { SerialPort } from "./web-serial";

export type LineEnding = "none" | "lf" | "cr" | "crlf";
const endings: Record<LineEnding, string> = { none: "", lf: "\n", cr: "\r", crlf: "\r\n" };

/** How long to hold the first line while waiting for its line break. */
export const PREAMBLE_HOLD_MS = 250;
const PREAMBLE_MAX = 512;
// C0 controls other than tab/LF/CR, DEL, C1 controls and U+FFFD (an invalid byte).
const junk = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f\ufffd]/;
const controls = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f]/g;

/**
 * Turns raw serial bytes into display text.
 *
 * - Opening the port toggles DTR, which resets an Arduino. The UART glitches
 *   while the board resets, and the USB bridge can hold stale bytes, so the
 *   first line often starts with noise. Until the first line break arrives,
 *   text is held and everything up to the last garbled character is dropped.
 * - Line endings are normalized: CRLF and a lone CR both become LF, so text
 *   from Serial.println() and carriage-return-only devices renders correctly.
 *   CRLF split across two reads is handled.
 * - Remaining non-printing control characters (NUL, BEL, etc.) are removed.
 */
export class SerialTextDecoder {
  private decoder = new TextDecoder();
  private afterCR = false;
  private preamble: string | null = "";

  /** True while the first line is being held back. */
  get holding() { return this.preamble !== null && this.preamble.length > 0; }

  push(bytes: Uint8Array): string {
    const text = this.decoder.decode(bytes, { stream: true });
    if (this.preamble === null) return this.normalize(text);
    this.preamble += text;
    const lineBreak = this.preamble.search(/[\r\n]/);
    if (lineBreak < 0 && this.preamble.length < PREAMBLE_MAX) return "";
    return this.release();
  }

  /** Stops holding the first line and returns it without leading noise. */
  release(): string {
    if (this.preamble === null) return "";
    const held = this.preamble;
    this.preamble = null;
    const lineBreak = held.search(/[\r\n]/);
    const end = lineBreak < 0 ? held.length : lineBreak;
    let start = 0;
    for (let index = 0; index < end; index++)
      if (junk.test(held[index])) start = index + 1;
    return this.normalize(held.slice(start));
  }

  /** Returns any buffered text at the end of the stream. */
  flush(): string {
    const held = this.release();
    return held + this.normalize(this.decoder.decode());
  }

  private normalize(text: string): string {
    let output = "";
    for (const character of text) {
      if (this.afterCR) {
        this.afterCR = false;
        if (character === "\n") continue;
      }
      if (character === "\r") {
        output += "\n";
        this.afterCR = true;
      } else output += character;
    }
    return output.replace(controls, "");
  }
}

export interface SerialMonitorSession {
  readonly closed: boolean;
  send(text: string, ending: LineEnding): Promise<void>;
  close(): Promise<void>;
}

export async function openSerialMonitor(
  port: SerialPort,
  baudRate: number,
  onText: (text: string) => void,
  onDisconnect: (error: Error) => void,
): Promise<SerialMonitorSession> {
  await port.open({ baudRate, bufferSize: 4096 });
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  let writer: WritableStreamDefaultWriter<Uint8Array>;
  try {
    if (!port.readable || !port.writable)
      throw new Error("The serial port cannot be read or written.");
    reader = port.readable.getReader();
    try { writer = port.writable.getWriter(); } catch (error) {
      reader.releaseLock();
      throw error;
    }
  } catch (error) {
    await port.close().catch(() => {});
    throw error;
  }

  let closing = false;
  let closeTask: Promise<void> | undefined;
  let writes = Promise.resolve();
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new SerialTextDecoder();
  const emit = (text: string) => { if (text) onText(text); };
  const readTask = (async (): Promise<Error | undefined> => {
    try {
      while (!closing) {
        const { value, done } = await reader.read();
        if (done) {
          clearTimeout(holdTimer);
          emit(decoder.flush());
          return new Error("The Arduino disconnected. Reconnect USB and connect again.");
        }
        if (value) {
          emit(decoder.push(value));
          // Show a first line that never gets a line break (e.g. a prompt).
          if (decoder.holding && holdTimer === undefined)
            holdTimer = setTimeout(() => { if (!closing) emit(decoder.release()); }, PREAMBLE_HOLD_MS);
        }
      }
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      reader.releaseLock();
    }
  })();

  function close() {
    if (closeTask) return closeTask;
    closing = true;
    clearTimeout(holdTimer);
    closeTask = (async () => {
      // Cancel the pending read before awaiting the loop or closing the port.
      await reader.cancel().catch(() => {});
      await readTask;
      await writes.catch(() => {});
      writer.releaseLock();
      await port.close();
    })();
    return closeTask;
  }

  void readTask.then(error => {
    if (closing) return;
    // Report why the connection dropped, even if closing the dead port also fails.
    const reason = error ?? new Error("The serial connection closed.");
    void close().then(() => onDisconnect(reason), () => onDisconnect(reason));
  });

  return {
    get closed() { return closing; },
    send(text, ending) {
      if (closing) return Promise.reject(new Error("Connect to your Arduino before sending."));
      const bytes = new TextEncoder().encode(text + endings[ending]);
      writes = writes.then(() => writer.write(bytes));
      return writes;
    },
    close,
  };
}
