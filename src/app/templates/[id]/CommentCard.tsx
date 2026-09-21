"use client";

import { useState } from "react";
import { EditableField } from "./EditableField";
import { updateCommentAction } from "@/app/actions";
import { AlertIcon, CheckIcon, ImageIcon, SpinnerIcon } from "@/app/_components/icons";

type SaveState = "idle" | "saving" | "saved" | "error";

interface ImportedPhoto {
  slot: number;
  url: string;
  caption: string | null;
}

interface CommentData {
  id: string;
  name: string;
  textHtml: string | null;
  commentType: string | null;
  severity: number | null;
  answerType: string | null;
  multipleChoiceOptions: string[] | null;
  recommendation: string | null;
  sourceMetadata?: Record<string, unknown> | null;
}

// sourceMetadata is an untyped jsonb catch-all at the DB layer (see
// schema.ts) - this narrows just the one shape this card actually renders,
// without trusting the rest of it.
function importedPhotos(sourceMetadata: Record<string, unknown> | null | undefined): ImportedPhoto[] {
  const raw = sourceMetadata?.photos;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ImportedPhoto =>
      typeof p === "object" && p !== null && typeof (p as ImportedPhoto).url === "string"
  );
}

/**
 * Comment text is edited as its underlying (sanitized) HTML in a textarea,
 * with a live rendered preview beside it - simple, fully lossless for the
 * link/formatting cases the real export contains, and honest about not
 * being a WYSIWYG editor (see NOTES.md / DECISIONS.md for why that tradeoff
 * was made). Everything else on the row (answer type, options, severity,
 * recommendation) is shown read-only: preserved from the source export,
 * visible to build trust, but out of scope for editing in this baseline.
 */
export function CommentCard({ templateId, comment }: { templateId: string; comment: CommentData }) {
  const [text, setText] = useState(comment.textHtml ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [showPreview, setShowPreview] = useState(true);

  async function saveText() {
    if (text === (comment.textHtml ?? "")) return;
    setState("saving");
    try {
      await updateCommentAction(templateId, comment.id, { textHtml: text });
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setState("error");
    }
  }

  const photos = importedPhotos(comment.sourceMetadata);

  return (
    <li className="border border-gray-200 rounded-lg p-3.5 bg-white">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <EditableField
          initialValue={comment.name}
          ariaLabel={`Comment name: ${comment.name}`}
          className="font-medium text-sm bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none"
          onSave={(name) => updateCommentAction(templateId, comment.id, { name })}
        />
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {comment.commentType && <TypeBadge type={comment.commentType} />}
          {comment.severity !== null && <Badge>severity {comment.severity}</Badge>}
          {comment.answerType && <Badge>{comment.answerType}</Badge>}
          {comment.recommendation && <Badge>rec: {comment.recommendation}</Badge>}
        </div>
      </div>

      {comment.multipleChoiceOptions && comment.multipleChoiceOptions.length > 0 && (
        <p className="text-xs text-gray-500 mt-1.5">
          Options: {comment.multipleChoiceOptions.join(", ")}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {photos.map((photo) => (
            <ImportedPhotoChip key={photo.slot} photo={photo} />
          ))}
        </div>
      )}

      <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          rows={3}
          placeholder="(no comment text)"
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
        {showPreview && (
          <div
            className="text-sm border border-gray-100 bg-gray-50/60 rounded-lg p-2.5 prose-sm [&_a]:underline [&_a]:text-blue-600"
            dangerouslySetInnerHTML={{ __html: text || "<span class='text-gray-400'>(no comment text)</span>" }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
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
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <AlertIcon /> Save failed
          </span>
        )}
      </div>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gray-50 text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
      {children}
    </span>
  );
}

/**
 * Visible proof that a Default Photo N value from the export survived the
 * import (see mapRows.ts / schema.ts sourceMetadata.photos) - not a media
 * manager, just a thumbnail-if-it-loads, always-clickable link to the
 * original URL so the content is never hidden even if the image itself
 * can't be fetched (expired CDN link, hotlink protection, CORS, etc).
 */
function ImportedPhotoChip({ photo }: { photo: ImportedPhoto }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      title={photo.caption ? `${photo.caption} — ${photo.url}` : photo.url}
      className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg pl-1 pr-2 py-1 hover:bg-gray-50 hover:border-gray-300 transition-colors max-w-[220px]"
    >
      {imgFailed ? (
        <ImageIcon className="text-gray-400 shrink-0" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external, unknown-origin URL; next/image can't optimize arbitrary hosts without config
        <img
          src={photo.url}
          alt={photo.caption ?? `Imported photo ${photo.slot}`}
          className="w-5 h-5 rounded object-cover shrink-0"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      )}
      <span className="text-gray-600 truncate">
        {photo.caption ? photo.caption : `Imported photo ${photo.slot}`}
      </span>
    </a>
  );
}

/**
 * Purely informational, color-coded by the source export's own comment
 * type - not a control, not clickable, no behavior beyond a badge that
 * exists in InterNACHI/ASHI and presumably other Spectora exports too
 * (info/limit/defect). Any other value it may take in a different export
 * still renders, just in the neutral style.
 */
function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    info: "bg-blue-50 text-blue-700 border-blue-200",
    limit: "bg-amber-50 text-amber-700 border-amber-200",
    defect: "bg-red-50 text-red-700 border-red-200",
  };
  const style = styles[type] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return <span className={`rounded-full px-2 py-0.5 border ${style}`}>{type}</span>;
}
