"use client";

import { useRef, useState, useTransition } from "react";
import { createSectionAction } from "@/app/actions";
import { AlertIcon, PlusIcon, SpinnerIcon } from "@/app/_components/icons";

/**
 * The one addition to the editor beyond renaming existing imported
 * content: append a new, empty section to the template. Deliberately
 * narrow - no add-item, no add-comment, no reordering (see NOTES.md,
 * "Chosen improvement"). A newly created section behaves exactly like an
 * imported one everywhere else: rename it with the same EditableField,
 * and it's included automatically the next time the template is
 * duplicated, independent of the original from that point on.
 */
export function AddSectionForm({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function cancel() {
    setOpen(false);
    setName("");
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Section name cannot be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createSectionAction(templateId, trimmed);
        setOpen(false);
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create this section.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-3 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
      >
        <PlusIcon />
        Add section
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm p-4 space-y-2.5">
      <label htmlFor="new-section-name" className="block text-sm font-medium text-gray-900">
        New section name
      </label>
      <input
        id="new-section-name"
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
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
        placeholder="e.g. Pool & Spa"
        disabled={isPending}
        className="block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:opacity-50"
      />
      {error && (
        <div className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertIcon className="shrink-0" />
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white rounded-lg px-3.5 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending && <SpinnerIcon />}
          {isPending ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-3.5 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
