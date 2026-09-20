"use client";

import { useRef, useState, useTransition } from "react";
import { commitImportAction, previewImportAction, type PreviewFailure, type PreviewResult } from "@/app/actions";

export default function ImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewResult | PreviewFailure | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, startCommit] = useTransition();

  async function handlePreview() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setPreview({ ok: false, filename: "unknown", errorMessage: "Choose a file first." });
      return;
    }
    setIsPreviewing(true);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await previewImportAction(formData);
      setPreview(result);
      if (result.ok) setTemplateName(result.suggestedName);
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !preview?.ok) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("templateName", templateName);
    startCommit(() => {
      commitImportAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border border-neutral-200 rounded-lg bg-white p-5 space-y-3">
        <label className="block text-sm font-medium">Spectora HTML-text export (.xls / .xlsx)</label>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".xls,.xlsx"
          onChange={() => setPreview(null)}
          className="block w-full text-sm border border-neutral-300 rounded-md p-2"
        />
        <p className="text-xs text-neutral-500">
          From Spectora: Export to spreadsheet &rarr; Export HTML Text. Max 15 MB.
        </p>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPreviewing}
          className="text-sm font-medium border border-neutral-300 rounded-md px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-50"
        >
          {isPreviewing ? "Reading file..." : "Preview import"}
        </button>
      </div>

      {preview && !preview.ok && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
          <p className="font-medium">Could not import &quot;{preview.filename}&quot;</p>
          <p className="mt-1">{preview.errorMessage}</p>
        </div>
      )}

      {preview && preview.ok && (
        <div className="border border-neutral-200 rounded-lg bg-white p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Template name</label>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="block w-full border border-neutral-300 rounded-md p-2 text-sm"
            />
          </div>

          <dl className="grid grid-cols-3 gap-4 text-center">
            <Stat label="Sections" value={preview.stats.sectionsCount} />
            <Stat label="Items" value={preview.stats.itemsCount} />
            <Stat label="Comments" value={preview.stats.commentsCount} />
          </dl>

          <div>
            <p className="text-sm font-medium">Sections detected</p>
            <p className="text-sm text-neutral-600 mt-1">{preview.sectionNames.join(", ")}</p>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="border border-amber-300 bg-amber-50 rounded-md p-3">
              <p className="text-sm font-medium text-amber-900">
                Import completed with {preview.warnings.length} warning{preview.warnings.length > 1 ? "s" : ""}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800 list-disc list-inside max-h-48 overflow-y-auto">
                {preview.warnings.map((w, i) => (
                  <li key={i}>
                    {w.rowNumber ? <span className="font-mono text-xs">[row {w.rowNumber}] </span> : null}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-green-700">No warnings - every row mapped cleanly.</p>
          )}

          <button
            type="submit"
            disabled={isCommitting || !templateName.trim()}
            className="w-full bg-neutral-900 text-white rounded-md py-2 font-medium hover:bg-neutral-700 disabled:opacity-50"
          >
            {isCommitting ? "Importing..." : "Import template"}
          </button>
        </div>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
