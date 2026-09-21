"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditorStatus } from "./EditorStatusContext";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/app/_components/icons";

export function EditorStatusBar() {
  const { hasUnsavedChanges, isSaving, hasError, hasPendingWork } = useEditorStatus();
  const [isReturning, setIsReturning] = useState(false);
  const router = useRouter();

  function saveAndReturn() {
    // Blur whatever's focused so a pending edit fires its save now.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsReturning(true);
    const start = Date.now();
    const check = () => {
      if (!hasPendingWork() || Date.now() - start > 2000) {
        router.push("/");
        return;
      }
      setTimeout(check, 100);
    };
    setTimeout(check, 50);
  }

  return (
    <div className="sticky top-0 z-10 -mx-5 md:-mx-8 px-5 md:px-8 py-2.5 mb-1 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm flex items-center gap-1.5">
        {hasError ? (
          <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
            <AlertIcon /> Some changes failed to save
          </span>
        ) : isSaving ? (
          <span className="inline-flex items-center gap-1.5 text-gray-500">
            <SpinnerIcon /> Saving...
          </span>
        ) : hasUnsavedChanges ? (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <AlertIcon className="text-amber-500" /> Unsaved changes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-green-700">
            <CheckIcon /> All changes saved
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-3.5 py-2 hover:bg-gray-50 transition-colors"
        >
          Back to Templates
        </Link>
        <button
          type="button"
          onClick={saveAndReturn}
          disabled={isReturning}
          className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white rounded-lg px-3.5 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isReturning && <SpinnerIcon />}
          {isReturning ? "Saving..." : "Save & Back to Templates"}
        </button>
      </div>
    </div>
  );
}
