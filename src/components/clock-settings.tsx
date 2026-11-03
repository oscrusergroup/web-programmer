"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Clock, ClockArrowUp, Info, LoaderCircle } from "lucide-react";
import type { SerialPort } from "@/lib/serial/web-serial";
import { finishClockRequest, sendClockRequest, type ClockRequest } from "@/lib/serial/clock-request";
import { openSerialMonitor, type SerialMonitorSession } from "@/lib/serial/monitor";
import {
  clockSeconds, describeDrift, formatClock, GET_TIME_COMMAND, parseClockReply, setTimeCommand, type ClockZone,
} from "@/lib/serial/oscr-time";

type ClockStatus = { tone: "info" | "ok" | "warn"; text: string };
type ClockReply =
  | { type: "time"; seconds: number }
  | { type: "no-rtc" | "unknown" | "timeout" | "closed" };
type ClockSession = { port: SerialPort; monitor: SerialMonitorSession; ready: boolean };
export type ClockSettingsHandle = { release(): Promise<void> };

const CLOCK_BAUD = 9600;
const CLOCK_REPLY_TIMEOUT_MS = 4000;
// Opening the port resets the Arduino. The OSCR prints a version banner early
// in setup, then mounts the SD card and draws a menu before it reads commands.
const BOOT_BANNER_TIMEOUT_MS = 4000;
const BOOT_REPLY_TIMEOUT_MS = 10000;
const zoneLabels: Record<ClockZone, string> = { local: "local time", utc: "UTC" };
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Checks and sets the OSCR's real-time clock on the port chosen for uploads.
 * The port is opened at the updater's baud rate on first use and held until
 * `release()` (e.g. before an upload) or the port changes. `onBusyChange`
 * reports while a clock command is using the port.
 */
export function ClockSettings({ port, disabled = false, onBusyChange, ref }: {
  port: SerialPort | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  ref?: Ref<ClockSettingsHandle>;
}) {
  const [sending, setSending] = useState(false);
  const [clockZone, setClockZone] = useState<ClockZone>("local");
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const clockRequest = useRef<ClockRequest | null>(null);
  const answer = useRef<((reply: ClockReply) => void) | null>(null);
  const firstLine = useRef<(() => void) | null>(null);
  const partialLine = useRef("");
  const session = useRef<ClockSession | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const sendActive = useRef(false);

  const endClockRequest = useCallback(() => finishClockRequest(clockRequest), []);
  const settle = useCallback((reply: ClockReply) => {
    const resolve = answer.current;
    answer.current = null;
    resolve?.(reply);
  }, []);

  // Watch complete lines for the boot banner and replies to GETTIME / SETTIME.
  const watchClockReplies = useCallback((text: string) => {
    const lines = (partialLine.current + text).split("\n");
    partialLine.current = lines.pop()!.slice(-1024);
    if (lines.length) firstLine.current?.();
    if (!clockRequest.current || !mounted.current) return;
    for (const line of lines) {
      const seconds = parseClockReply(line);
      const reply: ClockReply | undefined = seconds !== undefined ? { type: "time", seconds }
        : line.includes("Module is not enabled") ? { type: "no-rtc" }
        : line.includes("Unknown Command") ? { type: "unknown" }
        : undefined;
      if (!reply) continue;
      if (session.current) session.current.ready = true;
      endClockRequest();
      settle(reply);
      return;
    }
  }, [endClockRequest, settle]);

  const release = useCallback(async () => {
    generation.current++;
    endClockRequest();
    settle({ type: "closed" });
    firstLine.current = null;
    const current = session.current;
    session.current = null;
    await current?.monitor.close().catch(() => {});
  }, [endClockRequest, settle]);

  useImperativeHandle(ref, () => ({ release }), [release]);

  useEffect(() => {
    mounted.current = true;
    const leave = () => void release();
    window.addEventListener("pagehide", leave);
    // FAT32 has no time zone: Linux reads file times as UTC, Windows and macOS as local time.
    if (/Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent)) setClockZone("utc");
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", leave);
      void release();
    };
  }, [release]);

  useEffect(() => {
    if (session.current && session.current.port !== port) void release();
    setClockStatus(null);
  }, [port, release]);

  useEffect(() => {
    onBusyChange?.(sending);
  }, [sending, onBusyChange]);

  /** Opens `target` for clock commands and waits for the OSCR to restart. */
  async function open(target: SerialPort): Promise<ClockSession | null> {
    const attempt = ++generation.current;
    partialLine.current = "";
    const banner = Promise.withResolvers<void>();
    firstLine.current = banner.resolve;
    const monitor = await openSerialMonitor(target, CLOCK_BAUD, watchClockReplies, failure => {
      if (!mounted.current || attempt !== generation.current) return;
      session.current = null;
      endClockRequest();
      settle({ type: "closed" });
      setClockStatus({ tone: "warn", text: failure.message });
    });
    if (!mounted.current || attempt !== generation.current || monitor.closed) {
      await monitor.close();
      return null;
    }
    const current: ClockSession = { port: target, monitor, ready: false };
    session.current = current;
    // Wait out the bootloader so commands reach the OSCR. A board without
    // auto-reset sends no banner, so carry on after the timeout.
    await Promise.race([banner.promise, pause(BOOT_BANNER_TIMEOUT_MS)]);
    firstLine.current = null;
    return session.current === current ? current : null;
  }

  /** Sends `command` and resolves with the OSCR's reply, a timeout, or "closed". */
  function ask(current: ClockSession, kind: "check" | "set", zone: ClockZone, command: string, timeoutMs: number) {
    return new Promise<ClockReply>((resolve, reject) => {
      answer.current = resolve;
      // The updater reads commands up to a newline.
      sendClockRequest(clockRequest, { kind, zone }, {
        timeoutMs,
        onTimeout: () => settle({ type: "timeout" }),
        isStale: () => session.current !== current,
      }, () => current.monitor.send(command, "lf")).catch(failure => {
        if (answer.current === resolve) answer.current = null;
        reject(failure);
      });
    });
  }

  function report(kind: "check" | "set", zone: ClockZone, reply: ClockReply) {
    if (!mounted.current) return;
    switch (reply.type) {
      case "time": {
        const drift = reply.seconds - clockSeconds(Date.now(), zone);
        setClockStatus({
          tone: Math.abs(drift) <= 2 ? "ok" : "warn",
          text: `${kind === "set" ? "Clock set. " : ""}OSCR reads ${formatClock(reply.seconds)}, ${describeDrift(drift)} (${zoneLabels[zone]}).`,
        });
        break;
      }
      case "no-rtc":
        setClockStatus({ tone: "warn", text: "This firmware has no real-time clock. Enable ENABLE_RTC (and your RTC chip) in the config, then flash again." });
        break;
      case "unknown":
        setClockStatus({ tone: "warn", text: "The firmware didn't recognize the clock command. Flash a newer OSCR release with the updater enabled." });
        break;
      case "timeout":
        setClockStatus({
          tone: "warn",
          text: "No reply. Clock commands need ENABLE_UPDATER and ENABLE_RTC in a HW3 or HW5 build (not Serial monitor), and the OSCR sitting at a menu.",
        });
        break;
    }
  }

  async function clockCommand(kind: "check" | "set") {
    if (!port || disabled || sendActive.current) return;
    const zone = clockZone;
    sendActive.current = true;
    setSending(true);
    try {
      let current = session.current;
      if (!current) {
        setClockStatus({ tone: "info", text: "Connecting. The OSCR restarts when its USB port opens…" });
        current = await open(port);
        if (!current) return;
      }
      if (!current.ready) {
        // Commands sent while the OSCR is still starting wait in its buffer,
        // which would make SETTIME late. Wait for an answer first.
        setClockStatus({ tone: "info", text: "Waiting for the OSCR to reach its menu…" });
        const reply = await ask(current, "check", zone, GET_TIME_COMMAND, BOOT_REPLY_TIMEOUT_MS);
        if (kind === "check" || reply.type !== "time") return report(kind, zone, reply);
      }
      setClockStatus({ tone: "info", text: kind === "set" ? "Setting the clock…" : "Asking the OSCR for the time…" });
      // The OSCR sets whole seconds, so send right at the start of the next second.
      if (kind === "set") await pause(1000 - (Date.now() % 1000));
      if (session.current !== current) return;
      const command = kind === "set" ? setTimeCommand(clockSeconds(Date.now(), zone)) : GET_TIME_COMMAND;
      report(kind, zone, await ask(current, kind, zone, command, CLOCK_REPLY_TIMEOUT_MS));
    } catch (failure) {
      if (mounted.current) {
        setClockStatus({ tone: "warn", text: failure instanceof Error ? failure.message : "Could not reach the OSCR." });
        await release();
      }
    } finally {
      sendActive.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const ready = !!port && !disabled && !sending;

  return (
    <section className="panel p-5" aria-labelledby="clock-settings-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="clock-settings-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Clock size={15} aria-hidden="true" /> OSCR clock
        </h2>
        {sending && <LoaderCircle size={14} className="animate-spin text-muted" aria-hidden="true" />}
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
        <button type="button" onClick={() => clockCommand("check")} disabled={!ready} className="button-secondary"><Clock size={15} /> Check time</button>
        <button type="button" onClick={() => clockCommand("set")} disabled={!ready} className="button-secondary"><ClockArrowUp size={15} /> Set time</button>
      </div>
      <p role="status" className={`mt-3 text-[11px] leading-5 ${clockStatus?.tone === "warn" ? "text-amber-700 dark:text-amber-300" : clockStatus?.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>
        {clockStatus?.text ?? (port
          ? "Set time sends this computer's clock. Pick the zone of the computer you'll read the SD card on. The first command restarts the OSCR."
          : "Connect your Arduino above to check or set the time.")}
      </p>
    </section>
  );
}
