"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Code2,
  Cpu,
  Download,
  Gamepad2,
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
  type ConfigOption,
  type Selection,
} from "@/lib/config";
import {
  serialAPI,
  uploadFirmware,
  type SerialPort,
} from "@/lib/serial/web-serial";
import { HardwareFields, CoreFields, OptionFields } from "./config-fields";
import { BoardArt } from "./board-art";

type Build = {
  hex: string;
  log: string;
  config: string;
  flashBytes: number;
  ramBytes: number;
  fingerprint: string;
  duration: number;
  version: string;
};
const steps = [
  { title: "Hardware", icon: CircuitBoard },
  { title: "Game systems", icon: Gamepad2 },
  { title: "Options", icon: Settings2 },
];
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Programmer({
  source,
  schema,
  version,
}: {
  source: string;
  schema: ConfigOption[];
  version: string;
}) {
  const [values, setValues] = useState<Selection>(() =>
    defaultSelection(schema),
  );
  const [step, setStep] = useState(0),
    [supported, setSupported] = useState<boolean | null>(null);
  const [compiler, setCompiler] = useState<boolean | null>(null),
    [build, setBuild] = useState<Build | null>(null);
  const [busy, setBusy] = useState<"build" | "upload" | null>(null),
    [error, setError] = useState("");
  const [log, setLog] = useState(""),
    [phase, setPhase] = useState(""),
    [progress, setProgress] = useState(0);
  const [port, setPort] = useState<SerialPort | null>(null),
    [uploaded, setUploaded] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const guide = useRef<HTMLDialogElement>(null);
  const activeOperation = useRef(false);
  const hardware = HARDWARE.find((k) => values[k]);
  const coreCount = schema.filter(
    (o) => o.section === CORE_SECTION && values[o.key],
  ).length;
  const errors = validateSelection(schema, values),
    warnings = configurationWarnings(values);
  async function checkCompiler() {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setCompiler(data.ready === true);
    } catch {
      setCompiler(false);
    }
  }
  useEffect(() => {
    setSupported(!!serialAPI() && window.isSecureContext);
    void checkCompiler();
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
    if (errors.length || activeOperation.current) return;
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
        body: JSON.stringify(values),
      });
      const data = await response.json();
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
    if (!port || !build || activeOperation.current) return;
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
  const fields = { schema, values, onChange: update, disabled: !!busy };
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
          <a
            href="/"
            className="flex items-center gap-3"
            aria-label="Cartridge Lab home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
              <CircuitBoard size={25} strokeWidth={1.6} />
            </span>
            <span className="text-lg font-bold tracking-[-.6px]">
              cartridge<span className="font-normal text-muted">lab</span>
            </span>
          </a>
          <nav className="flex items-center gap-7 text-sm">
            <span className="hidden font-semibold text-accent sm:block">
              Firmware programmer
            </span>
            <button
              aria-label="Quick guide"
              onClick={() => guide.current?.showModal()}
              className="flex items-center gap-2 text-muted hover:text-ink"
            >
              <BookOpen size={16} />
              <span className="hidden sm:inline">Quick guide</span>
            </button>
            <a
              aria-label="The OSCR project"
              href="https://github.com/oscartreader"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-muted hover:text-ink"
            >
              <span className="hidden md:inline">The project</span>
              <ArrowUpRight size={17} />
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-5 pt-10 pb-12 sm:px-8 sm:pt-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Open Source Cartridge Reader
              <span className="ml-1 rounded bg-[#e7edf7] px-2 py-0.5 font-mono text-[10px]">
                {version}
              </span>
            </div>
            <h1 className="text-[29px] leading-tight font-semibold tracking-[-1.2px] sm:text-[38px]">
              A fresh start for your reader.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Your hardware. Your favorite systems. Build and install custom
              <br className="hidden sm:block" /> firmware, right here in your
              browser.
            </p>
          </div>
          <div className="mb-1 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${compiler === true ? "bg-emerald-500" : compiler === false ? "bg-amber-500" : "bg-slate-300"}`}
            />
            {compiler === null
              ? "Checking compiler…"
              : compiler
                ? "Build server ready"
                : "Compiler setup needed"}
          </div>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_350px]">
          <section
            className="panel overflow-hidden"
            aria-label="Firmware configuration"
          >
            <div
              className="flex border-b border-slate-200 bg-[#fcfdff]"
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
                  className={`relative flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-5 text-xs font-semibold sm:text-sm ${step === i ? "border-accent text-accent" : "border-transparent text-muted hover:bg-slate-50"}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === i ? "bg-accent text-white" : "bg-slate-100 text-slate-500"}`}
                  >
                    {i + 1}
                  </span>
                  <Icon size={16} className="hidden sm:block" />
                  {title}
                  {i === 1 && (
                    <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] sm:block">
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-7">
              <button
                onClick={restore}
                disabled={!!busy}
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
                  disabled={!!busy || !!errors.length}
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
              <div className="board-grid flex h-[177px] items-center justify-center border-b border-slate-200 bg-[#eef3fb] px-3">
                <BoardArt />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold tracking-tight">
                    Your firmware
                  </h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-muted">
                    {version}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Built for Arduino Mega 2560
                </p>
                <dl className="mt-5 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted">Hardware revision</dt>
                    <dd
                      className={hardware ? "font-semibold" : "text-amber-700"}
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
                  <div className="mt-5 rounded-lg bg-[#f0f7f4] p-3">
                    <div className="mb-2 flex justify-between text-[11px]">
                      <span className="font-medium text-emerald-800">
                        Flash memory
                      </span>
                      <span className="text-muted">
                        {(build.flashBytes / 1024).toFixed(1)} / 248 KB
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
                      <div
                        className="h-full bg-emerald-600"
                        style={{
                          width: `${Math.min(100, (build.flashBytes / 253952) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted">
                      RAM: {(build.ramBytes / 1024).toFixed(1)} / 8 KB · Built
                      in {(build.duration / 1000).toFixed(1)}s
                    </p>
                  </div>
                )}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  {errors.filter((e) => !e.includes("exactly one hardware"))
                    .length > 0 && (
                    <div
                      role="status"
                      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
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
                    disabled={!!busy || !!errors.length || compiler !== true}
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
                  {!hardware && (
                    <p className="mt-2 text-center text-[11px] text-muted">
                      Choose your hardware to get started.
                    </p>
                  )}
                  {compiler === false && (
                    <div className="mt-3 text-xs leading-5 text-amber-800">
                      The host must run <code>npm run setup:arduino</code>.
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
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${port ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
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
                    className="text-xs font-semibold text-accent disabled:text-slate-400"
                  >
                    {port ? "Change" : "Connect"}
                  </button>
                </div>
                <button
                  onClick={upload}
                  disabled={!!busy || !build || !port || !supported}
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
                {build && (
                  <button
                    onClick={() =>
                      download(`OSCR-${version}-${hardware}.hex`, build.hex)
                    }
                    disabled={!!busy}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] text-muted hover:text-accent"
                  >
                    <Download size={12} />
                    Download compiled .hex
                  </button>
                )}
                <p className="mt-4 text-center text-[10px] leading-5 text-muted">
                  {supported === false
                    ? "USB upload needs desktop Chrome or Edge over HTTPS. You can still build and download firmware."
                    : "USB upload works in desktop Chrome and Edge."}
                </p>
              </div>
            </section>
            <div className="flex gap-3 px-2 text-xs leading-5 text-muted">
              <Info size={16} className="mt-0.5 shrink-0 text-[#8598b8]" />
              <p>
                Pick only the systems you need. Enabling too many cores can
                exceed your reader’s memory.
              </p>
            </div>
          </aside>
        </div>
        <div aria-live="polite" className="mt-5 space-y-3">
          {warnings.length > 0 && hardware && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-6 text-blue-900">
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 whitespace-pre-line text-red-800"
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
                  className="mt-3 h-2 overflow-hidden rounded bg-slate-100"
                >
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  Compiling the selected cores and libraries. The first build
                  can take a few minutes.
                </p>
              )}
            </div>
          )}
          {uploaded && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
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
              <pre className="max-h-80 overflow-auto border-t border-slate-200 bg-[#18283f] p-5 font-mono text-[11px] leading-5 whitespace-pre-wrap text-slate-200">
                {log}
              </pre>
            )}
          </section>
        )}
        <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5 text-[11px] text-muted">
          <p>Made for the joy of keeping games alive.</p>
          <p className="flex items-center gap-1.5">
            <Cpu size={12} />
            Open Source Cartridge Reader <span className="px-1">/</span> GPL-3.0
            firmware
          </p>
        </footer>
      </main>
      <dialog
        ref={guide}
        className="fixed inset-0 m-auto w-[min(92vw,550px)] rounded-2xl border border-slate-200 bg-white p-7 text-ink shadow-xl backdrop:bg-slate-900/40"
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
        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-muted">
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
