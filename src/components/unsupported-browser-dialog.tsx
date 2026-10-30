"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { serialSupported } from "@/lib/serial/web-serial";

export function UnsupportedBrowserDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!serialSupported() && !dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="unsupported-browser-title"
      aria-describedby="unsupported-browser-description"
      onCancel={(event) => event.preventDefault()}
      // Browsers may close anyway on a repeated Escape or a back gesture.
      onClose={(event) => event.currentTarget.showModal()}
      className="fixed inset-0 m-auto w-[min(92vw,480px)] rounded-2xl border border-line bg-surface p-7 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center gap-3">
        <TriangleAlert size={22} className="shrink-0 text-accent" />
        <h2 id="unsupported-browser-title" className="text-xl font-semibold">Unsupported browser</h2>
      </div>
      <p id="unsupported-browser-description" className="mt-4 text-sm leading-6 text-muted">
        OSCR Programmer talks to your Arduino over USB, which this browser can’t do here.
        Open this page in desktop Chrome or Edge over HTTPS to continue.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer" className="button-primary">Get Chrome</a>
        <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer" className="button-secondary">Get Edge</a>
      </div>
    </dialog>
  );
}
