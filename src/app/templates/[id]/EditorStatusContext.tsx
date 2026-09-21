"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type FieldStatus = "dirty" | "saving" | "error";

/**
 * Aggregates the save state of every EditableField / comment textarea on
 * the page into one status bar, without changing how or when anything is
 * actually persisted. Each field still saves itself independently via its
 * own Server Action call on blur (see EditableField.tsx / CommentCard.tsx)
 * - this only tracks "does at least one field currently have unsaved
 * input, or a save in flight, or a failed save" so the editor can show one
 * honest, page-level answer instead of the user having to scan 350+
 * individual field indicators themselves.
 */
interface EditorStatusContextValue {
  reportStatus: (fieldId: string, status: FieldStatus | "idle") => void;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  hasError: boolean;
  /** Synchronous, ref-backed - safe to poll from outside React's render cycle. */
  hasPendingWork: () => boolean;
}

const noop = () => {};
const EditorStatusContext = createContext<EditorStatusContextValue>({
  reportStatus: noop,
  hasUnsavedChanges: false,
  isSaving: false,
  hasError: false,
  hasPendingWork: () => false,
});

function summarize(statuses: Map<string, FieldStatus>) {
  const values = Array.from(statuses.values());
  return {
    hasUnsavedChanges: values.some((s) => s === "dirty" || s === "saving"),
    isSaving: values.some((s) => s === "saving"),
    hasError: values.some((s) => s === "error"),
  };
}

export function EditorStatusProvider({ children }: { children: React.ReactNode }) {
  // The Map is the source of truth, kept in a ref so `hasPendingWork()` can
  // read it synchronously from outside React's render cycle (a polling
  // loop in EditorStatusBar). The three booleans below are ordinary state,
  // recomputed and set from `reportStatus` (an event-handler callback, not
  // render) so the render body itself never reads `ref.current`.
  const statuses = useRef(new Map<string, FieldStatus>());
  const [summary, setSummary] = useState({ hasUnsavedChanges: false, isSaving: false, hasError: false });

  const reportStatus = useCallback((fieldId: string, status: FieldStatus | "idle") => {
    const current = statuses.current.get(fieldId);
    if (status === "idle") {
      if (current === undefined) return;
      statuses.current.delete(fieldId);
    } else {
      if (current === status) return;
      statuses.current.set(fieldId, status);
    }
    setSummary(summarize(statuses.current));
  }, []);

  const hasPendingWork = useCallback(
    () => Array.from(statuses.current.values()).some((s) => s === "dirty" || s === "saving"),
    []
  );

  const value = useMemo(
    () => ({ reportStatus, ...summary, hasPendingWork }),
    [reportStatus, summary, hasPendingWork]
  );

  return <EditorStatusContext.Provider value={value}>{children}</EditorStatusContext.Provider>;
}

export function useEditorStatus() {
  return useContext(EditorStatusContext);
}
