"use client";

import { useRef, useState, useTransition } from "react";
import { AlertIcon, PlusIcon, SpinnerIcon } from "@/app/_components/icons";

/**
 * One reusable "add a child row" control, used at all three levels the
 * importer itself builds - section, item, and comment (there is no
 * separate "subsection" anywhere in this data model; see NOTES.md,
 * "Editor extension: Add section / item / comment"). Each level just
 * supplies its own label text and an `onCreate` call bound to the right
 * Server Action, the same pattern EditableField already uses for renaming
 * at all three levels via its `onSave` prop.
 */
export function AddChildForm({
  buttonLabel,
  fieldLabel,
  placeholder,
  onCreate,
  compact = false,
}: {
  buttonLabel: string;
  fieldLabel: string;
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = `new-child-name-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;

  function cancel() {
    setOpen(false);
    setName("");
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await onCreate(trimmed);
        setOpen(false);
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create this.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={
          compact
            ? "w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-2 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
            : "w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-3 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
        }
      >
        <PlusIcon width={compact ? 12 : 15} height={compact ? 12 : 15} />
        {buttonLabel}
      </button>
    );
  }

  return (
    <div
      className={
        compact
          ? "border border-gray-200 rounded-lg bg-white p-3 space-y-2"
          : "border border-gray-200 rounded-xl bg-white shadow-sm p-4 space-y-2.5"
      }
      onClick={(e) => e.stopPropagation()}
    >
      <label htmlFor={fieldId} className="block text-xs font-medium text-gray-900">
        {fieldLabel}
      </label>
      <input
        id={fieldId}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder={placeholder}
        disabled={isPending}
        className="block w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:opacity-50"
      />
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertIcon className="shrink-0" width={12} height={12} />
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending && <SpinnerIcon width={11} height={11} />}
          {isPending ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
