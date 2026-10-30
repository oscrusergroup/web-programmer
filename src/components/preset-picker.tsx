"use client";
import { useRef, useState } from "react";
import { FileDown, FileUp, Pencil, Save, Trash2, X } from "lucide-react";
import type { Preset } from "@/lib/presets";

export const presetKey = (preset: Preset) =>
  `${preset.builtIn ? "built-in" : "user"}:${preset.id}`;

type Props = {
  builtIns: Preset[];
  userPresets: Preset[];
  selected?: Preset;
  modified: boolean;
  note: string;
  error: string;
  storageAvailable: boolean;
  disabled: boolean;
  onSelect: (key: string) => void;
  onSave: (mode: "new" | "edit", name: string, description: string) => void;
  onUpdate: () => void;
  onDelete: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
};

const action =
  "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-40";
const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export function PresetPicker(props: Props) {
  const { selected, modified, disabled, storageAvailable } = props;
  const dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"new" | "edit">("new");
  const [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const userSelected = selected && !selected.builtIn;
  const message = props.error || props.note ||
    (storageAvailable ? "" : "Your browser is blocking site storage, so presets can't be saved or imported here.") ||
    selected?.description || "";
  const label = (preset: Preset) =>
    preset === selected && modified ? `${preset.name} (modified)` : preset.name;
  function openDialog(next: "new" | "edit") {
    setMode(next);
    setName(selected?.name ?? "");
    setDescription(selected?.description ?? "");
    dialog.current?.showModal();
  }
  return (
    <div>
      <h2 id="preset-heading" className="text-sm font-semibold">Preset</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Start from a ready-made configuration, or save your own and share it as a file.
      </p>
      <label htmlFor="preset" className="mb-2 mt-4 block text-xs font-semibold">Configuration preset</label>
      <select id="preset" value={selected ? presetKey(selected) : ""} disabled={disabled}
        onChange={event => props.onSelect(event.target.value)} className={field}>
        <option value="">Default</option>
        {props.builtIns.length > 0 && <optgroup label="Built-in presets">
          {props.builtIns.map(p => <option key={p.id} value={presetKey(p)}>{label(p)}</option>)}
        </optgroup>}
        {props.userPresets.length > 0 && <optgroup label="My presets">
          {props.userPresets.map(p => <option key={p.id} value={presetKey(p)}>{label(p)}</option>)}
        </optgroup>}
      </select>
      {/* One fixed line so changing presets or showing a note never resizes the panel. */}
      <p role={props.error ? "alert" : "status"} title={message || undefined}
        className={`mt-2 h-5 truncate text-xs leading-5 ${props.error ? "text-red-800 dark:text-red-200" : props.note ? "text-amber-800 dark:text-amber-200" : "text-muted"}`}>
        {message}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={action} disabled={disabled || !storageAvailable} onClick={() => openDialog("new")}>
          <Save size={13} />Save as new
        </button>
        {userSelected && modified && <button className={action} disabled={disabled} onClick={props.onUpdate}>
          <Save size={13} />Update preset
        </button>}
        {userSelected && <button className={action} disabled={disabled} aria-label="Edit preset" title="Edit preset"
          onClick={() => openDialog("edit")}>
          <Pencil size={13} />
        </button>}
        {userSelected && <button className={action} disabled={disabled} aria-label="Delete preset" title="Delete preset"
          onClick={() => { if (confirm(`Delete the preset “${selected.name}”?`)) props.onDelete(); }}>
          <Trash2 size={13} />
        </button>}
        <button className={action} disabled={disabled || !storageAvailable} onClick={() => fileInput.current?.click()}>
          <FileUp size={13} />Import
        </button>
        <button className={action} disabled={disabled} onClick={props.onExport}>
          <FileDown size={13} />Export
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) props.onImport(file);
          }} />
      </div>
      <dialog ref={dialog}
        className="fixed inset-0 m-auto w-[min(92vw,450px)] rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50">
        <form method="dialog" onSubmit={() => props.onSave(mode, name.trim(), description.trim())}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{mode === "new" ? "Save as new preset" : "Edit preset"}</h2>
            <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className="rounded p-1 text-muted">
              <X size={18} />
            </button>
          </div>
          <label htmlFor="preset-name" className="mb-2 mt-5 block text-xs font-semibold">Name</label>
          <input id="preset-name" required maxLength={80} value={name}
            onChange={event => setName(event.target.value)} className={field} />
          <label htmlFor="preset-description" className="mb-2 mt-4 block text-xs font-semibold">Description</label>
          <textarea id="preset-description" rows={3} maxLength={500} value={description}
            onChange={event => setDescription(event.target.value)} className={field} />
          <button type="submit" disabled={!name.trim()} className="button-primary mt-5 w-full">
            <Save size={16} />{mode === "new" ? "Save preset" : "Save changes"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
