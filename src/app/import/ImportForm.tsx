"use client";

import { useRef, useState, useTransition } from "react";
import { commitImportAction, previewImportAction, type PreviewFailure, type PreviewResult } from "@/app/actions";
import { AlertIcon, CheckIcon, FileIcon, SpinnerIcon, UploadIcon } from "@/app/_components/icons";

export default function ImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | PreviewFailure | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, startCommit] = useTransition();

  function chooseFile(f: File | null) {
    setFile(f);
    setPreview(null);
  }

  async function handlePreview() {
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
      <div className="border border-gray-200 rounded-xl bg-white p-5 shadow-sm space-y-4">
        <label className="block text-sm font-medium text-gray-900">
          Spectora HTML-text export (.xls / .xlsx)
        </label>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragActive(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) chooseFile(dropped);
          }}
          className={
            "rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors " +
            (isDragActive
              ? "border-blue-400 bg-blue-50"
              : file
                ? "border-gray-200 bg-gray-50"
                : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/40")
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".xls,.xlsx"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
              <FileIcon className="text-blue-600 shrink-0" />
              <span className="font-medium truncate max-w-xs">{file.name}</span>
              <span className="text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  chooseFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="ml-2 text-gray-400 hover:text-red-600 text-xs font-medium"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="text-gray-500">
              <UploadIcon className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm">
                <span className="text-blue-600 font-medium">Click to browse</span> or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">.xls or .xlsx, max 15 MB</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          From Spectora: Export to spreadsheet &rarr; Export HTML Text.
        </p>

        <button
          type="button"
          onClick={handlePreview}
          disabled={isPreviewing || !file}
          className="inline-flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {isPreviewing && <SpinnerIcon />}
          {isPreviewing ? "Reading file..." : "Preview import"}
        </button>
      </div>

      {preview && !preview.ok && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 flex gap-3">
          <AlertIcon className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-800">Could not import &quot;{preview.filename}&quot;</p>
            <p className="mt-1 text-red-700">{preview.errorMessage}</p>
          </div>
        </div>
      )}

      {preview && preview.ok && (
        <div className="border border-gray-200 rounded-xl bg-white p-5 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Template name</label>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sections" value={preview.stats.sectionsCount} />
            <Stat label="Items" value={preview.stats.itemsCount} />
            <Stat label="Comments" value={preview.stats.commentsCount} />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Sections detected</p>
            <p className="text-sm text-gray-500 mt-1">{preview.sectionNames.join(", ")}</p>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3.5">
              <div className="flex items-center gap-2">
                <AlertIcon className="text-amber-500 shrink-0" />
                <p className="text-sm font-medium text-amber-900">
                  Import completed with {preview.warnings.length} warning
                  {preview.warnings.length > 1 ? "s" : ""}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-amber-800 list-disc list-inside max-h-48 overflow-y-auto pl-1">
                {preview.warnings.map((w, i) => (
                  <li key={i}>
                    {w.rowNumber ? <span className="font-mono text-xs">[row {w.rowNumber}] </span> : null}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckIcon className="text-green-600 shrink-0" />
              No warnings - every row mapped cleanly.
            </div>
          )}

          <button
            type="submit"
            disabled={isCommitting || !templateName.trim()}
            className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isCommitting && <SpinnerIcon />}
            {isCommitting ? "Importing..." : "Import template"}
          </button>
        </div>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
