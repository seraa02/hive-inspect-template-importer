"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteTemplateAction } from "@/app/actions";
import { AlertIcon, SpinnerIcon, TrashIcon } from "@/app/_components/icons";

/**
 * Simple confirmed permanent delete - no recycle bin. The assignment does
 * not require deletion at all; this exists so stray/duplicate templates
 * (from testing, or from an inspector who imported the wrong file) can be
 * cleaned up without touching the database directly. See NOTES.md for why
 * a soft-delete/recycle-bin was deliberately not built.
 */
export function DeleteTemplateButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTemplateAction(templateId);
      } catch (err) {
        // deleteTemplateAction ends in redirect("/"), which Next.js
        // implements by throwing a control-flow error - let that
        // propagate so the redirect actually happens. Anything else is a
        // genuine failure: show a generic message, never the raw error.
        unstable_rethrow(err);
        setError("Could not delete this template. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors"
      >
        <TrashIcon />
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-template-title"
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-template-title" className="font-semibold text-gray-900">
              Delete template?
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              This will permanently delete &quot;{templateName}&quot; and its sections, items, and
              comments. This action cannot be undone.
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mt-3">
                <AlertIcon className="text-red-500 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-3.5 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="inline-flex items-center gap-2 text-sm font-medium bg-red-600 text-white rounded-lg px-3.5 py-2 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending && <SpinnerIcon />}
                {isPending ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
