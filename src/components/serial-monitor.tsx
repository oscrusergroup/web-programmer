"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Download, Send, Terminal, Trash2, Unplug, Usb } from "lucide-react";
import { ThemeSelect } from "./theme-select";
import { serialAPI } from "@/lib/serial/web-serial";
import { openSerialMonitor, type LineEnding, type SerialMonitorSession } from "@/lib/serial/monitor";

const MAX_OUTPUT = 200_000;
const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000];
type Status = "disconnected" | "connecting" | "connected" | "disconnecting";

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
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", release);
      release();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pendingText.current = "";
    };
  }, []);

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
      const connection = await openSerialMonitor(port, baud, appendText, failure => {
        if (!mounted.current || attempt !== generation.current) return;
        session.current = null;
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
  async function transmit(text: string, lineEnding: LineEnding) {
    const current = session.current;
    if (!current || sendActive.current) return false;
    sendActive.current = true;
    setSending(true);
    setError("");
    try {
      await current.send(text, lineEnding);
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
        </section>

        <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs leading-6 text-muted">
          <p className="max-w-2xl">OSCR uses 9600 baud. To check or set the clock, use the OSCR clock panel on the programmer page. For Serial monitor firmware, send <code>u</code> or <code>d</code> to browse and <code>0–6</code> to select. Use no line ending for these commands.</p>
          <p>Disconnect before uploading firmware.</p>
        </div>
        <p className="mt-2 text-[11px] text-muted">The console keeps the most recent 200,000 characters. Save your log before leaving this page.</p>
      </main>
    </div>
  );
}
