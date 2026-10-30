"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Code2,
  Download,
  Gamepad2,
  Github,
  Info,
  LoaderCircle,
  RotateCcw,
  Settings2,
  Terminal,
  Upload,
  Usb,
  X,
} from "lucide-react";
import {
  HARDWARE,
  CORE_SECTION,
  defaultSelection,
  validateSelection,
  generateConfig,
  configurationWarnings,
  type Selection,
} from "@/lib/config";
import {
  serialAPI,
  uploadFirmware,
  type SerialPort,
} from "@/lib/serial/web-serial";
import { HardwareFields, CoreFields, OptionFields } from "./config-fields";
import { ClockSettings } from "./clock-settings";
import { ThemeSelect } from "./theme-select";
import { isSupportedRelease } from "@/lib/release-options";
import type { BuildResult, FirmwareProject, FirmwareRelease } from "@/lib/firmware";

type Build = BuildResult;
const steps = [
  { title: "Hardware", icon: CircuitBoard },
  { title: "Game systems", icon: Gamepad2 },
  { title: "Options", icon: Settings2 },
];
const hardwarePreviews: Partial<Record<string, {
  src: string; alt: string;
}>> = {
  HW1: {
    src: "/images/hardware-1.webp",
    alt: "Open Source Cartridge Reader Hardware 1",
  },
  HW2: {
    src: "/images/hardware-2.webp",
    alt: "Open Source Cartridge Reader Hardware 2",
  },
  HW3: {
    src: "/images/hardware-3.webp",
    alt: "Open Source Cartridge Reader Hardware 3",
  },
  HW4: {
    src: "/images/hardware-4.webp",
    alt: "Open Source Cartridge Reader Hardware 4",
  },
  HW5: {
    src: "/images/hardware-5.webp",
    alt: "Open Source Cartridge Reader Hardware 5",
  },
  SERIAL_MONITOR: {
    src: "/images/serial-monitor.webp",
    alt: "Desktop PC displaying a serial terminal",
  },
};
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Programmer(initialProject: FirmwareProject) {
  const [project, setProject] = useState(initialProject);
  const { source, schema, version, revision } = project;
  const [firmwareId, setFirmwareId] = useState("latest");
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [releaseError, setReleaseError] = useState("");
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [firmwareReady, setFirmwareReady] = useState(true);
  const [values, setValues] = useState<Selection>(() =>
    defaultSelection(schema),
  );
  const [step, setStep] = useState(0),
    [supported, setSupported] = useState<boolean | null>(null);
  const [compiler, setCompiler] = useState<boolean | null>(null),
    [build, setBuild] = useState<Build | null>(null);
  const [busy, setBusy] = useState<"build" | "upload" | "source" | null>(null),
    [error, setError] = useState("");
  const [log, setLog] = useState(""),
    [phase, setPhase] = useState(""),
    [progress, setProgress] = useState(0);
  const [port, setPort] = useState<SerialPort | null>(null),
    [uploaded, setUploaded] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [clockConnected, setClockConnected] = useState(false);
  const guide = useRef<HTMLDialogElement>(null);
  const activeOperation = useRef(false);
  const hardware = HARDWARE.find((k) => values[k]);
  const hardwarePreview = hardwarePreviews[hardware ?? "HW5"];
  const coreCount = schema.filter(
    (o) => o.section === CORE_SECTION && values[o.key],
  ).length;
  const errors = validateSelection(schema, values),
    warnings = configurationWarnings(values);
  async function loadReleases() {
    setLoadingReleases(true);
    setReleaseError("");
    try {
      const response = await fetch("/api/releases");
      const data = await response.json() as { releases: FirmwareRelease[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load releases.");
      setReleases(data.releases.filter(isSupportedRelease));
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : "Could not load releases.");
    } finally { setLoadingReleases(false); }
  }
  async function selectFirmware(id: string) {
    if (activeOperation.current) return;
    activeOperation.current = true;
    setFirmwareId(id);
    setFirmwareReady(false);
    setBusy("source");
    setElapsed(0);
    setPhase("Loading firmware options");
    setSourceError("");
    setBuild(null);
    setUploaded(false);
    setError("");
    setLog("");
    setShowLog(false);
    try {
      const response = await fetch(`/api/firmware?source=${encodeURIComponent(id)}`);
      const data = await response.json() as FirmwareProject & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load firmware.");
      setProject(data);
      setValues(defaultSelection(data.schema));
      setStep(0);
      setFirmwareReady(true);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Could not load firmware.");
    } finally {
      activeOperation.current = false;
      setBusy(null);
    }
  }
  async function checkCompiler() {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error();
      const data = await response.json() as { ready?: boolean };
      setCompiler(data.ready === true);
    } catch {
      setCompiler(false);
    }
  }
  useEffect(() => {
    setSupported(!!serialAPI() && window.isSecureContext);
    void checkCompiler();
    void loadReleases();
    const api = serialAPI();
    const disconnected = (event: Event) => {
      setPort((current) => (event.target === current ? null : current));
    };
    api?.addEventListener("disconnect", disconnected);
    return () => api?.removeEventListener("disconnect", disconnected);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [busy]);
  function update(key: string, value: boolean | string) {
    if (activeOperation.current) return;
    setValues((current) => {
      const next = { ...current };
      if (HARDWARE.includes(key)) HARDWARE.forEach((k) => (next[k] = false));
      // The rotary display option only exists on HW4/HW5; its toggle is locked elsewhere.
      if (HARDWARE.includes(key) && "ENABLE_ROTARY_NEW_OSCR" in next && !["HW4", "HW5"].includes(key))
        next.ENABLE_ROTARY_NEW_OSCR = false;
      if (["DS3231", "DS1307"].includes(key)) {
        next.DS3231 = false;
        next.DS1307 = false;
      }
      next[key] = value;
      return next;
    });
    setBuild(null);
    setUploaded(false);
    setError("");
    setLog("");
    setShowLog(false);
  }
  function restore() {
    if (activeOperation.current) return;
    setValues({
      ...defaultSelection(schema),
      ...(hardware ? { [hardware]: true } : {}),
    });
    setBuild(null);
    setUploaded(false);
    setError("");
    setLog("");
    setShowLog(false);
  }
  async function buildFirmware() {
    if (!firmwareReady || errors.length || activeOperation.current) return;
    activeOperation.current = true;
    setBusy("build");
    setElapsed(0);
    setError("");
    setBuild(null);
    setUploaded(false);
    setLog("");
    setPhase("Compiling your firmware");
    try {
      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, revision }),
      });
      const data = await response.json() as BuildResult & { error?: string };
      if (data.log) setLog(data.log);
      if (!response.ok) throw new Error(data.error || "Build failed.");
      setBuild(data);
      setCompiler(true);
      setPhase("Firmware ready");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Build failed. Please try again.",
      );
      setShowLog(true);
    } finally {
      activeOperation.current = false;
      setBusy(null);
    }
  }
  async function connect() {
    if (activeOperation.current) return;
    try {
      const api = serialAPI();
      if (!api)
        throw new Error(
          "Open this page in desktop Chrome or Edge to connect over USB.",
        );
      const selected = await api.requestPort();
      setPort(selected);
      setError("");
      setUploaded(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        return;
      setError(
        error instanceof Error
          ? error.message
          : "Could not select the Arduino.",
      );
    }
  }
  async function upload() {
    if (!port || !build || clockConnected || activeOperation.current) return;
    activeOperation.current = true;
    setBusy("upload");
    setElapsed(0);
    setProgress(0);
    setError("");
    setUploaded(false);
    try {
      await uploadFirmware(port, build.hex, (nextPhase, percent) => {
        setPhase(nextPhase);
        setProgress(percent);
      });
      setUploaded(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Upload failed. Reconnect your Arduino and retry.",
      );
    } finally {
      activeOperation.current = false;
      setBusy(null);
    }
  }
  const fields = { schema, values, onChange: update, disabled: !!busy || !firmwareReady };
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8">
          <a
            href="/"
            className="flex items-center gap-2 sm:gap-3"
            aria-label="OSCR Programmer home"
          >
            <span className="flex shrink-0 flex-col whitespace-nowrap leading-none">
              <span className="text-base font-bold tracking-[-.5px] sm:text-lg">OSCR Programmer</span>
              <span className="mt-1 text-[10px] text-muted sm:text-[11px]">Open Source Cartridge Reader</span>
            </span>
          </a>
          <nav className="flex items-center gap-2 text-sm sm:gap-5">
            <span className="hidden font-semibold text-accent lg:block">
              Firmware programmer
            </span>
            <Link href="/serial-monitor" aria-label="Serial monitor" className="flex items-center gap-2 text-muted hover:text-ink">
              <Terminal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Serial monitor</span>
            </Link>
            <button
              aria-label="Quick guide"
              onClick={() => guide.current?.showModal()}
              className="flex items-center gap-2 text-muted hover:text-ink"
            >
              <BookOpen size={16} />
              <span className="hidden sm:inline">Quick guide</span>
            </button>
            <a
              aria-label="GitHub"
              href="https://github.com/oscrusergroup/web-programmer"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-muted hover:text-ink"
            >
              <Github size={16} aria-hidden="true" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <ThemeSelect />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-5 pt-10 pb-12 sm:px-8 sm:pt-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[29px] leading-tight font-semibold tracking-[-1.2px] sm:text-[38px]">
              Program your OSCR
            </h1>
          </div>
          <div className="mb-1 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[11px] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${compiler === true ? "bg-emerald-500" : compiler === false ? "bg-amber-500" : "bg-line-strong"}`}
            />
            {compiler === null
              ? "Checking compiler…"
              : compiler
                ? "Build server ready"
                : "Compiler setup needed"}
          </div>
        </div>
        <section className="panel mb-5 p-5 sm:p-6" aria-labelledby="firmware-source-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-lg">
              <h2 id="firmware-source-heading" className="text-sm font-semibold">Firmware source</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Use the latest repository code or choose a release from V15.0 onward.
                Changing versions resets your configuration and previous build.
              </p>
            </div>
            <div className="w-full sm:max-w-xs">
              <label htmlFor="firmware-source" className="mb-2 block text-xs font-semibold">Code version</label>
              <select id="firmware-source" value={firmwareId} disabled={!!busy}
                onChange={event => void selectFirmware(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50">
                <option value="latest">Latest repository code</option>
                {releases.length > 0 && <optgroup label="Published releases">
                  {releases.map(release => <option key={release.id} value={release.id}>
                    {release.label}{release.tag !== release.label ? ` (${release.tag})` : ""}{release.prerelease ? " — prerelease" : ""}
                  </option>)}
                </optgroup>}
              </select>
              {loadingReleases && <p role="status" className="mt-2 text-xs text-muted">Loading releases…</p>}
              {!loadingReleases && !releaseError && !releases.length && <p className="mt-2 text-xs text-muted">No published releases available.</p>}
              {releaseError && <p role="alert" className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-200">{releaseError}{" "}
                <button onClick={() => void loadReleases()} className="font-medium underline">Retry release list</button>
              </p>}
              {firmwareReady && <p className="mt-2 font-mono text-[10px] text-muted">{version} · {revision.slice(0, 12)}</p>}
            </div>
          </div>
          {sourceError && <div role="alert" className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-xs leading-5 text-red-800 dark:text-red-200">{sourceError}{" "}
            <button disabled={!!busy} onClick={() => void selectFirmware(firmwareId)} className="font-medium underline">Retry version</button>
          </div>}
          {busy === "source" && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" />Loading firmware options…</p>}
        </section>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_350px]">
          <section
            className="panel overflow-hidden"
            aria-label="Firmware configuration"
          >
            <div
              className="flex border-b border-line bg-surface-soft"
              role="tablist"
              aria-label="Configuration steps"
            >
              {steps.map(({ title, icon: Icon }, i) => (
                <button
                  key={title}
                  role="tab"
                  id={`tab-${i}`}
                  aria-selected={step === i}
                  aria-controls={`panel-${i}`}
                  onClick={() => setStep(i)}
                  className={`relative flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-5 text-xs font-semibold sm:text-sm ${step === i ? "border-accent text-accent" : "border-transparent text-muted hover:bg-surface-soft"}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === i ? "bg-brand text-white" : "bg-surface-raised text-muted"}`}
                  >
                    {i + 1}
                  </span>
                  <Icon size={16} className="hidden sm:block" />
                  {title}
                  {i === 1 && (
                    <span className="hidden rounded bg-surface-raised px-1.5 py-0.5 text-[10px] sm:block">
                      {coreCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`panel-${step}`}
              aria-labelledby={`tab-${step}`}
              className="p-5 sm:p-7"
            >
              {step === 0 ? (
                <HardwareFields {...fields} />
              ) : step === 1 ? (
                <CoreFields {...fields} />
              ) : (
                <OptionFields {...fields} />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-4 sm:px-7">
              <button
                onClick={restore}
                disabled={!!busy || !firmwareReady}
                className="flex items-center gap-2 text-xs text-muted hover:text-ink disabled:opacity-40"
              >
                <RotateCcw size={13} />
                Restore defaults
              </button>
              {step < 2 ? (
                <button
                  className="flex items-center gap-2 text-xs font-semibold text-accent"
                  onClick={() => setStep(step + 1)}
                >
                  Next: {steps[step + 1].title.toLowerCase()}
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  className="flex items-center gap-2 text-xs font-semibold text-accent disabled:opacity-40"
                  disabled={!!busy || !firmwareReady || !!errors.length}
                  onClick={() =>
                    download("Config.h", generateConfig(source, schema, values))
                  }
                >
                  <Download size={14} />
                  Download Config.h
                </button>
              )}
            </div>
          </section>
          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="panel overflow-hidden">
              {hardwarePreview && (
                <div className="relative aspect-[4/3] border-b border-line">
                  <Image
                    {...hardwarePreview}
                    fill
                    sizes="(min-width: 1024px) 340px, (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                    loading="eager"
                    unoptimized
                    className="object-contain p-4"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold tracking-tight">
                    Your firmware
                  </h2>
                  <span className="rounded-md bg-surface-raised px-2 py-1 text-[10px] font-medium text-muted">
                    {firmwareReady ? version : "Loading source"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Built for Arduino Mega 2560
                </p>
                <dl className="mt-5 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted">Hardware revision</dt>
                    <dd
                      className={hardware ? "font-semibold" : "text-amber-700 dark:text-amber-300"}
                    >
                      {hardware === "SERIAL_MONITOR"
                        ? "Serial monitor"
                        : hardware || "Choose a revision"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Game systems</dt>
                    <dd className="font-semibold">{coreCount} selected</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Build target</dt>
                    <dd className="font-mono text-[11px]">
                      ATmega2560 · 16 MHz
                    </dd>
                  </div>
                </dl>
                {build && (
                  <div className="mt-5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3">
                    <div className="mb-2 flex justify-between text-[11px]">
                      <span className="font-medium text-emerald-800 dark:text-emerald-200">
                        Flash memory
                      </span>
                      <span className="text-muted">
                        {(build.flashBytes / 1024).toFixed(1)} / 248 KB
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900">
                      <div
                        className="h-full bg-emerald-600"
                        style={{
                          width: `${Math.min(100, (build.flashBytes / 253952) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted">
                      RAM: {(build.ramBytes / 1024).toFixed(1)} / 8 KB · {build.cached ? "Reused cached build" : `Built in ${(build.duration / 1000).toFixed(1)}s`}
                    </p>
                  </div>
                )}
                <div className="mt-5 border-t border-line-soft pt-4">
                  {errors.filter((e) => !e.includes("exactly one hardware"))
                    .length > 0 && (
                    <div
                      role="status"
                      className="mb-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs leading-5 text-amber-900 dark:text-amber-200"
                    >
                      <p className="font-semibold">Review your settings</p>
                      {errors
                        .filter((e) => !e.includes("exactly one hardware"))
                        .map((e) => (
                          <p key={e}>{e}</p>
                        ))}
                    </div>
                  )}
                  <button
                    onClick={buildFirmware}
                    disabled={!!busy || !firmwareReady || !!errors.length || compiler !== true}
                    className="button-primary w-full"
                  >
                    {busy === "build" ? (
                      <LoaderCircle size={17} className="animate-spin" />
                    ) : (
                      <Code2 size={17} />
                    )}{" "}
                    {busy === "build"
                      ? `Building… ${elapsed}s`
                      : build
                        ? "Rebuild firmware"
                        : "Build firmware"}
                  </button>
                  <p className="mt-2 min-h-4 text-center text-[11px] text-muted">
                    {!hardware && "Choose your hardware to get started."}
                  </p>
                  {compiler === false && (
                    <div className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                      The host must run <code>pnpm run setup:arduino</code>.
                      <button
                        onClick={checkCompiler}
                        className="ml-1 underline"
                      >
                        Check again
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${port ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-surface-raised text-muted"}`}
                  >
                    <Usb size={19} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold">
                      {port ? "USB device selected" : "Connect your Arduino"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {port
                        ? "Device checked before upload"
                        : "Use a USB data cable"}
                    </p>
                  </div>
                  <button
                    disabled={!!busy || !supported}
                    onClick={connect}
                    className="text-xs font-semibold text-accent disabled:text-muted"
                  >
                    {port ? "Change" : "Connect"}
                  </button>
                </div>
                <button
                  onClick={upload}
                  disabled={!!busy || !build || !port || !supported || clockConnected}
                  className="button-secondary mt-4 w-full py-3!"
                >
                  {busy === "upload" ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : uploaded ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Upload size={16} />
                  )}{" "}
                  {busy === "upload"
                    ? "Uploading…"
                    : uploaded
                      ? "Upload again"
                      : "Upload to Arduino"}
                </button>
                <a
                  href="https://github.com/oscrusergroup/sd-db/releases/latest/download/sd.zip"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] text-muted hover:text-accent"
                >
                  <Download size={12} />
                  Download SD card files (.zip)
                </a>
                <p className="mt-4 text-center text-[10px] leading-5 text-muted">
                  {supported === false
                    ? "USB upload needs desktop Chrome or Edge over HTTPS. You can still download the SD card files."
                    : clockConnected
                      ? "Disconnect the OSCR clock below before uploading."
                      : "USB upload works in desktop Chrome and Edge."}
                </p>
              </div>
            </section>
            <div className="flex gap-3 px-2 text-xs leading-5 text-muted">
              <Info size={16} className="mt-0.5 shrink-0 text-muted" />
              <p>
                Pick only the systems you need. Enabling too many cores can
                exceed your reader’s memory.
              </p>
            </div>
            <ClockSettings disabled={!!busy} onConnectedChange={setClockConnected} />
          </aside>
        </div>
        <div aria-live="polite" className="mt-5 space-y-3">
          {warnings.length > 0 && hardware && (
            <div className="rounded-xl border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-4 text-xs leading-6 text-blue-900 dark:text-blue-200">
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm leading-6 whitespace-pre-line text-red-800 dark:text-red-200"
            >
              {error}
            </div>
          )}
          {busy && (
            <div className="panel p-5">
              <div className="flex items-center gap-3 text-sm font-medium">
                <LoaderCircle size={16} className="animate-spin text-accent" />
                {phase}
                <span className="ml-auto text-xs text-muted">
                  {busy === "upload" ? `${progress}%` : `${elapsed}s elapsed`}
                </span>
              </div>
              {busy === "upload" ? (
                <div
                  role="progressbar"
                  aria-label={phase}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-3 h-2 overflow-hidden rounded bg-surface-raised"
                >
                  <div
                    className="h-full bg-brand transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  {busy === "source"
                    ? "Downloading the selected source and reading its Config.h options. The first download can take a minute."
                    : "Compiling the selected cores and libraries. The first build can take a few minutes."}
                </p>
              )}
            </div>
          )}
          {uploaded && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-5 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 size={22} />
              <div>
                <p className="text-sm font-semibold">Your reader is ready.</p>
                <p className="mt-1 text-xs">
                  Firmware uploaded and verified. Your Arduino will restart
                  automatically.
                </p>
              </div>
            </div>
          )}
        </div>
        {(log || build) && (
          <section className="panel mt-5 overflow-hidden">
            <button
              className="flex w-full items-center gap-2 p-4 text-xs font-semibold"
              aria-expanded={showLog}
              onClick={() => setShowLog(!showLog)}
            >
              <Terminal size={16} />
              Build output
              {build && (
                <span className="ml-2 font-normal text-muted">
                  {build.fingerprint}
                </span>
              )}
              <ChevronRight
                size={15}
                className={`ml-auto ${showLog ? "rotate-90" : ""}`}
              />
            </button>
            {showLog && (
              <pre className="max-h-80 overflow-auto border-t border-line bg-[#18283f] dark:bg-black p-5 font-mono text-[11px] leading-5 whitespace-pre-wrap text-slate-200">
                {log}
              </pre>
            )}
          </section>
        )}
        <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-line pt-5 text-[11px] text-muted">
          <a
            href="https://github.com/oscrusergroup/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink"
          >
            Open Source Cartridge Reader User Group
          </a>
        </footer>
      </main>
      <dialog
        ref={guide}
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
        className="fixed inset-0 m-auto w-[min(92vw,550px)] rounded-2xl border border-line bg-surface p-7 text-ink shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">From USB to ready to play</h2>
          <button
            aria-label="Close guide"
            onClick={() => guide.current?.close()}
            className="rounded p-1 text-muted"
          >
            <X size={20} />
          </button>
        </div>
        <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm leading-6 text-muted">
          <li>
            Choose the hardware revision printed on your reader and enable its
            installed modules.
          </li>
          <li>
            Select game systems and firmware options, then click{" "}
            <strong className="text-ink">Build firmware</strong>. The server
            compiles your configuration.
          </li>
          <li>
            Plug in your Mega 2560 using a USB data cable. Close other apps
            using its serial port. Click{" "}
            <strong className="text-ink">Connect</strong> and select its USB
            serial device.
          </li>
          <li>
            Click <strong className="text-ink">Upload to Arduino</strong>. Keep
            the USB cable connected until writing and verification finish.
          </li>
        </ol>
        <div className="mt-5 rounded-lg bg-surface-soft p-4 text-xs leading-5 text-muted">
          Use desktop Chrome or Edge. A hosted installation needs HTTPS and a
          Node server with Arduino CLI. Your USB port is accessed only by your
          browser; configuration and compilation run on the server.
        </div>
        <button
          className="button-primary mt-6 w-full"
          onClick={() => guide.current?.close()}
        >
          <Check size={16} />
          Got it
        </button>
      </dialog>
    </div>
  );
}
