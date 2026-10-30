"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, ClockArrowUp, Info, Unplug, Usb } from "lucide-react";
import { serialAPI } from "@/lib/serial/web-serial";
import { finishClockRequest, sendClockRequest, type ClockRequest } from "@/lib/serial/clock-request";
import { openSerialMonitor, type SerialMonitorSession } from "@/lib/serial/monitor";
import {
  clockSeconds, describeDrift, formatClock, GET_TIME_COMMAND, parseClockReply, setTimeCommand, type ClockZone,
} from "@/lib/serial/oscr-time";

type Status = "disconnected" | "connecting" | "connected" | "disconnecting";
type ClockStatus = { tone: "info" | "ok" | "warn"; text: string };
const CLOCK_BAUD = 9600;
const CLOCK_REPLY_TIMEOUT_MS = 4000;
const zoneLabels: Record<ClockZone, string> = { local: "local time", utc: "UTC" };

/**
 * Checks and sets the OSCR's real-time clock over its own serial connection.
 * `disabled` closes the connection so another operation (e.g. an upload) can
 * use the port; `onConnectedChange` reports whether the port is held open.
 */
export function ClockSettings({ disabled = false, onConnectedChange }: {
  disabled?: boolean;
  onConnectedChange?: (connected: boolean) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [sending, setSending] = useState(false);
  const [clockZone, setClockZone] = useState<ClockZone>("local");
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const clockRequest = useRef<ClockRequest | null>(null);
  const partialLine = useRef("");
  const session = useRef<SerialMonitorSession | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const sendActive = useRef(false);

  const endClockRequest = useCallback(() => finishClockRequest(clockRequest), []);

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

  const release = useCallback(() => {
    generation.current++;
    endClockRequest();
    const current = session.current;
    session.current = null;
    void current?.close().catch(() => {});
    if (mounted.current) setStatus("disconnected");
  }, [endClockRequest]);

  useEffect(() => {
    mounted.current = true;
    setSupported(!!serialAPI() && window.isSecureContext);
    window.addEventListener("pagehide", release);
    // FAT32 has no time zone: Linux reads file times as UTC, Windows and macOS as local time.
    if (/Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent)) setClockZone("utc");
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [release]);

  useEffect(() => {
    if (disabled && session.current) release();
  }, [disabled, release]);

  useEffect(() => {
    onConnectedChange?.(status !== "disconnected");
  }, [status, onConnectedChange]);

  async function connect() {
    if (status !== "disconnected" || disabled) return;
    const attempt = ++generation.current;
    setStatus("connecting");
    setClockStatus(null);
    try {
      const api = serialAPI();
      if (!api || !window.isSecureContext)
        throw new Error("Open this page in desktop Chrome or Edge over HTTPS to use USB serial.");
      const port = await api.requestPort();
      if (!mounted.current || attempt !== generation.current) return;
      partialLine.current = "";
      endClockRequest();
      const connection = await openSerialMonitor(port, CLOCK_BAUD, watchClockReplies, failure => {
        if (!mounted.current || attempt !== generation.current) return;
        session.current = null;
        endClockRequest();
        setStatus("disconnected");
        setClockStatus({ tone: "warn", text: failure.message });
      });
      if (!mounted.current || attempt !== generation.current || connection.closed) {
        await connection.close();
        return;
      }
      session.current = connection;
      setStatus("connected");
      setClockStatus({ tone: "info", text: "Connected. Wait for the OSCR to reach its menu, then check or set the time." });
    } catch (failure) {
      if (!mounted.current || attempt !== generation.current) return;
      setStatus("disconnected");
      if (failure instanceof DOMException && failure.name === "NotFoundError") return;
      setClockStatus({ tone: "warn", text: failure instanceof Error ? failure.message : "Could not open the serial port." });
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
      if (mounted.current) setClockStatus({ tone: "warn", text: failure instanceof Error ? failure.message : "Could not close the serial port." });
    } finally {
      if (mounted.current) setStatus("disconnected");
    }
  }

  async function clockCommand(kind: "check" | "set") {
    const current = session.current;
    if (!current || sendActive.current) return;
    const zone = clockZone;
    endClockRequest();
    sendActive.current = true;
    setSending(true);
    setClockStatus({ tone: "info", text: kind === "set" ? "Setting the clock…" : "Asking the OSCR for the time…" });
    try {
      // The OSCR sets whole seconds, so send right at the start of the next second.
      if (kind === "set") await new Promise<void>(resolve => setTimeout(resolve, 1000 - (Date.now() % 1000)));
      if (session.current !== current) return;
      const command = kind === "set" ? setTimeCommand(clockSeconds(Date.now(), zone)) : GET_TIME_COMMAND;
      // The updater reads commands up to a newline.
      await sendClockRequest(clockRequest, { kind, zone }, {
        timeoutMs: CLOCK_REPLY_TIMEOUT_MS,
        onTimeout: () => {
          if (mounted.current) setClockStatus({
            tone: "warn",
            text: "No reply. Clock commands need ENABLE_UPDATER and ENABLE_RTC in a HW3 or HW5 build (not Serial monitor), and the OSCR sitting at a menu.",
          });
        },
        isStale: () => session.current !== current,
      }, () => current.send(command, "lf"));
    } catch (failure) {
      if (mounted.current) {
        setClockStatus({ tone: "warn", text: failure instanceof Error ? failure.message : "Could not send the command." });
        await disconnect();
      }
    } finally {
      sendActive.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const connected = status === "connected";
  const busy = status === "connecting" || status === "disconnecting";

  return (
    <section className="panel p-5" aria-labelledby="clock-settings-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="clock-settings-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Clock size={15} aria-hidden="true" /> OSCR clock
        </h2>
        <button onClick={connected ? disconnect : connect} disabled={busy || disabled || supported !== true} className="flex items-center gap-1.5 text-xs font-semibold text-accent disabled:text-muted">
          {connected ? <Unplug size={13} /> : <Usb size={13} />}
          {connected ? "Disconnect" : status === "connecting" ? "Connecting…" : status === "disconnecting" ? "Disconnecting…" : "Connect"}
        </button>
      </div>
      <p className="mt-2 flex gap-2 rounded-lg bg-surface-raised p-3 text-[11px] leading-5 text-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Only for readers with an RTC module installed. Build with <code>ENABLE_RTC</code> and <code>ENABLE_UPDATER</code> on HW3 or HW5.</span>
      </p>
      <label htmlFor="clock-zone" className="mt-4 mb-2 block text-xs font-medium">Time zone</label>
      <select id="clock-zone" value={clockZone} onChange={event => setClockZone(event.target.value as ClockZone)} disabled={sending} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50">
        <option value="local">Local time (Windows, macOS)</option>
        <option value="utc">UTC (Linux)</option>
      </select>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => clockCommand("check")} disabled={!connected || sending} className="button-secondary"><Clock size={15} /> Check time</button>
        <button type="button" onClick={() => clockCommand("set")} disabled={!connected || sending} className="button-secondary"><ClockArrowUp size={15} /> Set time</button>
      </div>
      <p role="status" className={`mt-3 text-[11px] leading-5 ${clockStatus?.tone === "warn" ? "text-amber-700 dark:text-amber-300" : clockStatus?.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>
        {clockStatus?.text ?? "Set time sends this computer's clock. Pick the zone of the computer you'll read the SD card on. Disconnect before uploading firmware."}
      </p>
    </section>
  );
}
