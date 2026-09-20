"use client";

import { useState } from "react";
import { EditableField } from "./EditableField";
import { updateCommentAction } from "@/app/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

interface CommentData {
  id: string;
  name: string;
  textHtml: string | null;
  commentType: string | null;
  severity: number | null;
  answerType: string | null;
  multipleChoiceOptions: string[] | null;
  recommendation: string | null;
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

  return (
    <li className="border border-neutral-200 rounded-md p-3 bg-neutral-50/50">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <EditableField
          initialValue={comment.name}
          ariaLabel={`Comment name: ${comment.name}`}
          className="font-medium text-sm bg-transparent border-b border-dashed border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
          onSave={(name) => updateCommentAction(templateId, comment.id, { name })}
        />
        <div className="flex items-center gap-1.5 text-xs">
          {comment.commentType && <Badge>{comment.commentType}</Badge>}
          {comment.severity !== null && <Badge>severity {comment.severity}</Badge>}
          {comment.answerType && <Badge>{comment.answerType}</Badge>}
          {comment.recommendation && <Badge>rec: {comment.recommendation}</Badge>}
        </div>
      </div>

      {comment.multipleChoiceOptions && comment.multipleChoiceOptions.length > 0 && (
        <p className="text-xs text-neutral-500 mt-1">
          Options: {comment.multipleChoiceOptions.join(", ")}
        </p>
      )}

      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          rows={3}
          placeholder="(no comment text)"
          className="w-full text-sm border border-neutral-300 rounded-md p-2 font-mono text-xs focus:outline-none focus:border-neutral-500"
        />
        {showPreview && (
          <div
            className="text-sm border border-transparent rounded-md p-2 prose-sm [&_a]:underline [&_a]:text-blue-700"
            dangerouslySetInnerHTML={{ __html: text || "<span class='text-neutral-400'>(no comment text)</span>" }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
        {state === "saving" && <span className="text-xs text-neutral-400">Saving...</span>}
        {state === "saved" && <span className="text-xs text-green-600">Saved</span>}
        {state === "error" && <span className="text-xs text-red-600">Save failed</span>}
      </div>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5 border border-neutral-200">
      {children}
    </span>
  );
}
