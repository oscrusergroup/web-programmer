/**
 * Helpers for the OSCR firmware updater's clock commands (requires
 * ENABLE_UPDATER and ENABLE_RTC, and a non-Serial-monitor build).
 *
 *   GETTIME            -> "Current Time: 15Oct2026 12:30:05PM"
 *   SETTIME <epoch>    -> "Setting Time..." then "Current Time: ..."
 *
 * The RTC has no time zone and FAT32 timestamps don't either: Windows and
 * macOS read file times as local time, Linux reads them as UTC.
 */
export type ClockZone = "local" | "utc";

export const GET_TIME_COMMAND = "GETTIME";

/** The wall-clock reading the OSCR should hold at `nowMs`, as epoch seconds. */
export function clockSeconds(nowMs: number, zone: ClockZone): number {
  const offsetMinutes = zone === "local" ? new Date(nowMs).getTimezoneOffset() : 0;
  return Math.round(nowMs / 1000) - offsetMinutes * 60;
}

export function setTimeCommand(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 0x7fffffff)
    throw new RangeError("The time is outside the range the OSCR accepts.");
  return `SETTIME ${seconds}`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stamp = /Current Time:\s*(\d{1,2})([A-Za-z]{3})(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)?/;

/** Parses the firmware's "Current Time: DDMMMYYYY hh:mm:ssAP" reply as epoch seconds. */
export function parseClockReply(line: string): number | undefined {
  const match = stamp.exec(line);
  if (!match) return undefined;
  const [, day, monthName, year, hourText, minute, second, meridiem] = match;
  const month = months.findIndex(name => name.toLowerCase() === monthName.toLowerCase());
  if (month < 0) return undefined;
  let hour = Number(hourText);
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  }
  return Date.UTC(Number(year), month, Number(day), hour, Number(minute), Number(second)) / 1000;
}

/** Formats epoch seconds the way the clock reads them (no time-zone conversion). */
export function formatClock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    timeZone: "UTC", dateStyle: "medium", timeStyle: "medium",
  });
}

export function describeDrift(driftSeconds: number): string {
  const amount = Math.abs(driftSeconds);
  if (amount <= 1) return "matches this computer";
  const units: [number, string][] = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  const [size, unit] = units.find(([size]) => amount >= size)!;
  const value = Math.round(amount / size);
  return `${value} ${unit}${value === 1 ? "" : "s"} ${driftSeconds > 0 ? "ahead of" : "behind"} this computer`;
}
