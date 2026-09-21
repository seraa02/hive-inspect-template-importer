"use client";

import { useTransition } from "react";
import { duplicateTemplateAction } from "@/app/actions";
import { CopyIcon, SpinnerIcon } from "@/app/_components/icons";

export function DuplicateButton({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => duplicateTemplateAction(templateId))}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors disabled:opacity-50"
    >
      {isPending ? <SpinnerIcon /> : <CopyIcon />}
      {isPending ? "Duplicating..." : "Duplicate"}
    </button>
  );
}
