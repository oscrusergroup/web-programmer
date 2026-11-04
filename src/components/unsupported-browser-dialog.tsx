"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TriangleAlert, X } from "lucide-react";
import { serialSupported } from "@/lib/serial/web-serial";

const browsers = [
  { name: "Chrome", icon: "/images/browsers/chrome.svg", href: "https://www.google.com/chrome/" },
  { name: "Edge", icon: "/images/browsers/edge.svg", href: "https://www.microsoft.com/edge" },
  { name: "Firefox", icon: "/images/browsers/firefox.svg", href: "https://www.mozilla.org/firefox/new/" },
];

/**
 * Warns once per page load that this browser can't use USB serial, and keeps
 * a banner at the top of the page that reopens the warning.
 */
export function UnsupportedBrowserDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    if (serialSupported()) return;
    setUnsupported(true);
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <>
      {unsupported && (
        <div className="border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => dialog.current?.showModal()}
            className="mx-auto flex w-full max-w-[1240px] items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium sm:px-8"
          >
            <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
            <span>
              This browser can’t connect to your OSCR over USB.{" "}
              <span className="underline">Learn more</span>
            </span>
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby="unsupported-browser-title"
        aria-describedby="unsupported-browser-description"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            event.currentTarget.close();
          }
        }}
        className="fixed inset-0 m-auto w-[min(92vw,480px)] rounded-2xl border border-line bg-surface p-7 text-ink shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TriangleAlert size={22} className="shrink-0 text-accent" />
            <h2 id="unsupported-browser-title" className="text-xl font-semibold">Unsupported browser</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="rounded p-1 text-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <p id="unsupported-browser-description" className="mt-4 text-sm leading-6 text-muted">
          OSCR Programmer talks to your Arduino over USB, which this browser doesn’t support.
          Open this page in desktop Chrome, Edge, or Firefox to continue.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          {browsers.map(({ name, icon, href }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Download ${name}`}
              className="flex w-24 flex-col items-center gap-2 rounded-xl p-3 text-xs font-medium text-muted hover:bg-surface-soft hover:text-ink"
            >
              <Image src={icon} alt="" width={48} height={48} />
              {name}
            </a>
          ))}
        </div>
      </dialog>
    </>
  );
}
