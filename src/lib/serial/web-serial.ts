import { parseHex } from "./hex";
import { flashMega, type ByteTransport, type FlashProgress } from "./stk500v2";
export interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number; bufferSize: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: {
    dataTerminalReady: boolean;
    requestToSend: boolean;
  }): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
export interface SerialAPI extends EventTarget {
  requestPort(): Promise<SerialPort>;
}
export function serialAPI(): SerialAPI | undefined {
  return (navigator as Navigator & { serial?: SerialAPI }).serial;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SerialTransport implements ByteTransport {
  private buffer: number[] = [];
  private wake?: () => void;
  private error?: Error;
  private stopped = false;
  private pump: Promise<void>;
  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {
    this.pump = this.receive();
  }
  private async receive() {
    try {
      while (!this.stopped) {
        const { value, done } = await this.reader.read();
        if (done)
          throw new Error(
            "The Arduino disconnected. Reconnect the USB cable and try again.",
          );
        if (value) this.buffer.push(...value);
        if (this.buffer.length > 65536)
          throw new Error("Unexpected serial data overflow.");
        this.wake?.();
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.wake?.();
    }
  }
  async write(data: Uint8Array) {
    await this.writer.write(data);
  }
  async readExact(length: number, timeoutMs = 2500): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffer.length < length) {
      if (this.error) throw this.error;
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new Error(
          "The bootloader timed out. Close Arduino IDE's serial monitor, reconnect USB, and try again.",
        );
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.wake = undefined;
          resolve();
        }, remaining);
        this.wake = () => {
          clearTimeout(timer);
          this.wake = undefined;
          resolve();
        };
      });
    }
    return Uint8Array.from(this.buffer.splice(0, length));
  }
  clear() {
    this.buffer = [];
  }
  async close() {
    this.stopped = true;
    await this.reader.cancel().catch(() => {});
    await this.pump;
    this.reader.releaseLock();
    this.writer.releaseLock();
  }
}

export async function uploadFirmware(
  port: SerialPort,
  hex: string,
  progress: FlashProgress,
) {
  const image = parseHex(hex); // Validate before opening or resetting hardware.
  let transport: SerialTransport | undefined,
    opened = false;
  try {
    await port.open({ baudRate: 115200, bufferSize: 4096 });
    opened = true;
    if (!port.readable || !port.writable)
      throw new Error("The serial port cannot be read or written.");
    transport = new SerialTransport(
      port.readable.getReader(),
      port.writable.getWriter(),
    );
    progress("Resetting Arduino", 0);
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await pause(100);
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await pause(150);
    transport.clear();
    await flashMega(transport, image, progress);
  } finally {
    try {
      await transport?.close();
    } finally {
      if (opened) await port.close().catch(() => {});
    }
  }
}
