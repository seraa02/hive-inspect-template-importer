"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditorStatus } from "./EditorStatusContext";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/app/_components/icons";

/**
 * Every field on this page already saves itself the moment it loses focus
 * (see EditableField.tsx / CommentCard.tsx) - there is no separate draft or
 * transaction here, and this bar does not introduce one. It exists purely
 * so the user has one clear, page-level answer to "is my work saved?" and
 * one clear way back to the template list, instead of having to scan
 * dozens of individual per-field indicators or rely on the sidebar alone.
 */
export function EditorStatusBar() {
  const { hasUnsavedChanges, isSaving, hasError, hasPendingWork } = useEditorStatus();
  const [isReturning, setIsReturning] = useState(false);
  const router = useRouter();

  function saveAndReturn() {
    // Blur whatever's focused so an edit that hasn't lost focus yet fires
    // its own save now, same as it would on Tab/click-away.
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
    // Give the just-fired blur a tick to register as "saving" before the
    // first check, so a real in-flight save isn't missed.
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
