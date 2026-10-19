"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Clock, ClockArrowUp, Download, Send, Terminal, Trash2, Unplug, Usb } from "lucide-react";
import { ThemeSelect } from "./theme-select";
import { serialAPI } from "@/lib/serial/web-serial";
import { openSerialMonitor, type LineEnding, type SerialMonitorSession } from "@/lib/serial/monitor";
import {
  clockSeconds, describeDrift, formatClock, GET_TIME_COMMAND, parseClockReply, setTimeCommand, type ClockZone,
} from "@/lib/serial/oscr-time";

const MAX_OUTPUT = 200_000;
const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000];
type Status = "disconnected" | "connecting" | "connected" | "disconnecting";
type ClockStatus = { tone: "info" | "ok" | "warn"; text: string };
type ClockRequest = { kind: "check" | "set"; zone: ClockZone; timer: ReturnType<typeof setTimeout> };
const CLOCK_REPLY_TIMEOUT_MS = 4000;
const zoneLabels: Record<ClockZone, string> = { local: "local time", utc: "UTC" };

export function SerialMonitor() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [baud, setBaud] = useState(9600);
  const [ending, setEnding] = useState<LineEnding>("none");
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [clockZone, setClockZone] = useState<ClockZone>("local");
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const clockRequest = useRef<ClockRequest | null>(null);
  const partialLine = useRef("");
  const session = useRef<SerialMonitorSession | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const sendActive = useRef(false);
  const pendingText = useRef("");
  const frame = useRef<number | null>(null);
  const consoleView = useRef<HTMLPreElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const appendText = useCallback((text: string) => {
    if (!mounted.current) return;
    pendingText.current = (pendingText.current + text).slice(-MAX_OUTPUT);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!mounted.current) return;
      const next = pendingText.current;
      pendingText.current = "";
      setOutput(previous => (previous + next).slice(-MAX_OUTPUT));
    });
  }, []);

  const endClockRequest = useCallback(() => {
    if (clockRequest.current) clearTimeout(clockRequest.current.timer);
    clockRequest.current = null;
  }, []);

  // Watch complete lines for replies to GETTIME / SETTIME.
  const watchClockReplies = useCallback((text: string) => {
    const lines = (partialLine.current + text).split("\n");
    partialLine.current = lines.pop()!.slice(-1024);
    const request = clockRequest.current;
    if (!request || !mounted.current) return;
    for (const line of lines) {
      const reading = parseClockReply(line);
      if (reading !== undefined) {
        const drift = reading - clockSeconds(Date.now(), request.zone);
        endClockRequest();
        setClockStatus({
          tone: Math.abs(drift) <= 2 ? "ok" : "warn",
          text: `${request.kind === "set" ? "Clock set. " : ""}OSCR reads ${formatClock(reading)}, ${describeDrift(drift)} (${zoneLabels[request.zone]}).`,
        });
        return;
      }
      if (line.includes("Module is not enabled")) {
        endClockRequest();
        setClockStatus({ tone: "warn", text: "This firmware has no real-time clock. Enable ENABLE_RTC (and your RTC chip) in the config, then flash again." });
        return;
      }
      if (line.includes("Unknown Command")) {
        endClockRequest();
        setClockStatus({ tone: "warn", text: "The firmware didn't recognize the clock command. Flash a newer OSCR release with the updater enabled." });
        return;
      }
    }
  }, [endClockRequest]);

  const receive = useCallback((text: string) => {
    appendText(text);
    watchClockReplies(text);
  }, [appendText, watchClockReplies]);

  useEffect(() => {
    mounted.current = true;
    setSupported(!!serialAPI() && window.isSecureContext);
    const release = () => {
      generation.current++;
      const current = session.current;
      session.current = null;
      void current?.close().catch(() => {});
      if (mounted.current) setStatus("disconnected");
    };
    window.addEventListener("pagehide", release);
    // FAT32 has no time zone: Linux reads file times as UTC, Windows and macOS as local time.
    if (/Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent)) setClockZone("utc");
    return () => {
      mounted.current = false;
      endClockRequest();
      window.removeEventListener("pagehide", release);
      release();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pendingText.current = "";
    };
  }, [endClockRequest]);

  useEffect(() => {
    if (autoScroll && consoleView.current)
      consoleView.current.scrollTop = consoleView.current.scrollHeight;
  }, [output, autoScroll]);

  useEffect(() => {
    if (status === "connected" && !sending) input.current?.focus();
  }, [status, sending]);

  async function connect() {
    if (status !== "disconnected") return;
    const attempt = ++generation.current;
    setStatus("connecting");
    setError("");
    try {
      const api = serialAPI();
      if (!api || !window.isSecureContext)
        throw new Error("Open this page in desktop Chrome or Edge over HTTPS to use USB serial.");
      const port = await api.requestPort();
      if (!mounted.current || attempt !== generation.current) return;
      partialLine.current = "";
      endClockRequest();
      setClockStatus(null);
      const connection = await openSerialMonitor(port, baud, receive, failure => {
        if (!mounted.current || attempt !== generation.current) return;
        session.current = null;
        endClockRequest();
        setStatus("disconnected");
        setError(failure.message);
      });
      if (!mounted.current || attempt !== generation.current || connection.closed) {
        await connection.close();
        return;
      }
      session.current = connection;
      setStatus("connected");
    } catch (failure) {
      if (!mounted.current || attempt !== generation.current) return;
      setStatus("disconnected");
      if (failure instanceof DOMException && failure.name === "NotFoundError") return;
      setError(failure instanceof Error ? failure.message : "Could not open the serial port.");
    }
  }

  async function disconnect() {
    generation.current++;
    endClockRequest();
    const current = session.current;
    session.current = null;
    setStatus("disconnecting");
    try {
      await current?.close();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not close the serial port.");
    } finally {
      if (mounted.current) setStatus("disconnected");
    }
  }

  /** Sends text to the device, one transmission at a time. Returns false if it failed. */
  async function transmit(text: string | (() => string), lineEnding: LineEnding, beforeSend?: () => Promise<void>) {
    const current = session.current;
    if (!current || sendActive.current) return false;
    sendActive.current = true;
    setSending(true);
    setError("");
    try {
      await beforeSend?.();
      if (session.current !== current) return false;
      await current.send(typeof text === "function" ? text() : text, lineEnding);
      return mounted.current && session.current === current;
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Could not send the command.");
        await disconnect();
      }
      return false;
    } finally {
      sendActive.current = false;
      if (mounted.current) setSending(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!command.length && ending === "none") return;
    if (await transmit(command, ending)) setCommand("");
  }

  async function clockCommand(kind: "check" | "set") {
    if (!session.current || sendActive.current) return;
    const zone = clockZone;
    endClockRequest();
    setClockStatus({ tone: "info", text: kind === "set" ? "Setting the clock…" : "Asking the OSCR for the time…" });
    // The OSCR sets whole seconds, so send right at the start of the next second.
    const waitForSecond = () => new Promise<void>(resolve => setTimeout(resolve, 1000 - (Date.now() % 1000)));
    // The updater reads commands up to a newline, whatever line ending is selected.
    const sent = await transmit(
      () => kind === "set" ? setTimeCommand(clockSeconds(Date.now(), zone)) : GET_TIME_COMMAND,
      "lf",
      kind === "set" ? waitForSecond : undefined,
    );
    if (!sent) {
      if (mounted.current) setClockStatus(null);
      return;
    }
    clockRequest.current = {
      kind, zone,
      timer: setTimeout(() => {
        clockRequest.current = null;
        if (mounted.current) setClockStatus({
          tone: "warn",
          text: "No reply. Clock commands need ENABLE_UPDATER and ENABLE_RTC in a HW3 or HW5 build (not Serial monitor), 9600 baud, and the OSCR sitting at a menu.",
        });
      }, CLOCK_REPLY_TIMEOUT_MS),
    };
  }

  function clearOutput() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pendingText.current = "";
    setOutput("");
  }

  function saveOutput() {
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cartridge-lab-serial.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const connected = status === "connected";
  const busy = status === "connecting" || status === "disconnecting";

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between gap-3 px-5 sm:px-8">
          <Link href="/" aria-label="OSCR Programmer home" className="flex items-center gap-3">
            <span className="flex shrink-0 flex-col whitespace-nowrap leading-none">
              <span className="text-base font-bold tracking-[-.5px] sm:text-lg">OSCR Programmer</span>
              <span className="mt-1 text-[10px] text-muted sm:text-[11px]">Open Source Cartridge Reader</span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm">
            <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Programmer</span>
            </Link>
            <ThemeSelect />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[29px] font-semibold tracking-[-1px] sm:text-[38px]">Serial monitor</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Talk to your reader. Read its output and send commands over USB.
            </p>
          </div>
          <p role="status" className="flex items-center gap-2 text-xs text-muted">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : busy ? "bg-amber-500" : "bg-line-strong"}`} />
            {connected ? "Connected" : status === "connecting" ? "Connecting…" : status === "disconnecting" ? "Disconnecting…" : "Disconnected"}
          </p>
        </div>

        {supported === false && (
          <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            USB serial needs desktop Chrome or Edge over HTTPS. Open this page there to connect.
          </p>
        )}
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

        <section aria-label="Serial terminal" className="panel overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-5">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Baud rate
                <select value={baud} disabled={connected || busy} onChange={event => setBaud(Number(event.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50">
                  {baudRates.map(rate => <option key={rate} value={rate}>{rate}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Line ending
                <select value={ending} onChange={event => setEnding(event.target.value as LineEnding)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <option value="none">No line ending</option>
                  <option value="lf">Newline (LF)</option>
                  <option value="cr">Carriage return (CR)</option>
                  <option value="crlf">Both (CR + LF)</option>
                </select>
              </label>
            </div>
            <button onClick={connected ? disconnect : connect} disabled={busy || supported !== true} className={connected ? "button-secondary" : "button-primary"}>
              {connected ? <Unplug size={16} /> : <Usb size={16} />}
              {connected ? "Disconnect" : status === "connecting" ? "Connecting…" : status === "disconnecting" ? "Disconnecting…" : "Connect Arduino"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3 text-xs text-muted">
            <span className="flex items-center gap-2"><Terminal size={14} /> Device output</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={autoScroll} onChange={event => setAutoScroll(event.target.checked)} /> Autoscroll</label>
              <button onClick={clearOutput} className="flex items-center gap-1.5 hover:text-ink"><Trash2 size={13} /> Clear</button>
              <button onClick={saveOutput} disabled={!output} className="flex items-center gap-1.5 hover:text-ink disabled:opacity-40"><Download size={13} /> Save log</button>
            </div>
          </div>
          <pre ref={consoleView} aria-label="Serial output" role="log" aria-live="off" tabIndex={0} className="h-[min(55vh,520px)] min-h-72 overflow-auto bg-surface-soft p-5 font-mono text-xs leading-6 break-words whitespace-pre-wrap dark:bg-black sm:text-sm">
            {output || <span className="text-muted">{connected ? "Listening for your reader…" : "Connect your Arduino to see its serial output here."}</span>}
          </pre>
          <form onSubmit={send} className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row">
            <label htmlFor="serial-command" className="sr-only">Command</label>
            <input ref={input} id="serial-command" value={command} onChange={event => setCommand(event.target.value)} disabled={!connected || sending} autoComplete="off" spellCheck={false} placeholder="Enter a command, e.g. 0 or u" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 font-mono text-sm disabled:opacity-50" />
            <button type="submit" disabled={!connected || sending || (!command.length && ending === "none")} className="button-primary"><Send size={15} /> {sending ? "Sending…" : "Send"}</button>
          </form>
          <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-4 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
              <span className="flex items-center gap-2 text-xs font-medium"><Clock size={14} aria-hidden="true" /> OSCR clock</span>
              <label className="sr-only" htmlFor="clock-zone">Clock time zone</label>
              <select id="clock-zone" value={clockZone} onChange={event => setClockZone(event.target.value as ClockZone)} disabled={sending} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50">
                <option value="local">Local time (Windows, macOS)</option>
                <option value="utc">UTC (Linux)</option>
              </select>
              <button type="button" onClick={() => clockCommand("check")} disabled={!connected || sending} className="button-secondary"><Clock size={15} /> Check time</button>
              <button type="button" onClick={() => clockCommand("set")} disabled={!connected || sending} className="button-secondary"><ClockArrowUp size={15} /> Set time</button>
            </div>
            <p role="status" className={`min-w-0 text-xs leading-5 ${clockStatus?.tone === "warn" ? "text-amber-700 dark:text-amber-300" : clockStatus?.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>
              {clockStatus?.text ?? "Set time sends this computer's clock. Pick the zone of the computer you'll read the SD card on."}
            </p>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs leading-6 text-muted">
          <p className="max-w-2xl">OSCR uses 9600 baud. The clock buttons use the firmware updater: enable <code>ENABLE_UPDATER</code> and <code>ENABLE_RTC</code> on HW3 or HW5 and wait at a menu. For Serial monitor firmware, send <code>u</code> or <code>d</code> to browse and <code>0–6</code> to select. Use no line ending for these commands.</p>
          <p>Disconnect before uploading firmware.</p>
        </div>
        <p className="mt-2 text-[11px] text-muted">The console keeps the most recent 200,000 characters. Save your log before leaving this page.</p>
      </main>
    </div>
  );
}
