import type { ClockZone } from "./oscr-time";

export type ClockRequest = { kind: "check" | "set"; zone: ClockZone; timer: ReturnType<typeof setTimeout> };
type ClockRequestSlot = { current: ClockRequest | null };

/** Ends the pending request, or only `request` if it is still the pending one. */
export function finishClockRequest(slot: ClockRequestSlot, request = slot.current) {
  if (!request || slot.current !== request) return;
  clearTimeout(request.timer);
  slot.current = null;
}

/**
 * Registers a clock request, then writes its command. The OSCR can answer
 * before the write resolves, so the request must already be pending by then.
 * A failed write is rethrown unless `isStale` says its session has been replaced.
 */
export async function sendClockRequest(
  slot: ClockRequestSlot,
  { kind, zone }: Pick<ClockRequest, "kind" | "zone">,
  { timeoutMs, onTimeout, isStale }: { timeoutMs: number; onTimeout: () => void; isStale: () => boolean },
  write: () => Promise<void>,
) {
  finishClockRequest(slot);
  const request: ClockRequest = {
    kind, zone,
    timer: setTimeout(() => {
      finishClockRequest(slot, request);
      onTimeout();
    }, timeoutMs),
  };
  slot.current = request;
  try {
    await write();
  } catch (failure) {
    finishClockRequest(slot, request);
    if (!isStale()) throw failure;
  }
}
