"use client";

import { useTransition } from "react";
import { duplicateTemplateAction } from "@/app/actions";

export function DuplicateButton({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => duplicateTemplateAction(templateId))}
      className="text-sm font-medium border border-neutral-300 rounded-md px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-50"
    >
      {isPending ? "Duplicating..." : "Duplicate template"}
    </button>
  );
}
