"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/app/_components/icons";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * A single-line editable name (section name, item name, comment name).
 * Saves on blur or Enter; shows a lightweight status so the user always
 * knows whether their change actually persisted, per the assignment's
 * requirement for clear save/success/error states (no silent failures).
 */
export function EditableField({
  initialValue,
  onSave,
  className,
  ariaLabel,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function commit() {
    const trimmed = value.trim();
    if (trimmed === initialValue.trim() || trimmed === "") {
      setValue(initialValue);
      return;
    }
    setState("saving");
    try {
      await onSave(trimmed);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        aria-label={ariaLabel}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={
          className ??
          "bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none"
        }
      />
      {state === "saving" && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <SpinnerIcon /> Saving
        </span>
      )}
      {state === "saved" && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600">
          <CheckIcon /> Saved
        </span>
      )}
      {state === "error" && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600" title={errorMessage}>
          <AlertIcon /> Save failed
        </span>
      )}
    </span>
  );
}
