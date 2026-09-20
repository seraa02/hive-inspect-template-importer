import { notFound } from "next/navigation";
import { getImportForTemplate, getTemplateDetail } from "@/db/repo";
import { EditableField } from "./EditableField";
import { CommentCard } from "./CommentCard";
import { DuplicateButton } from "./DuplicateButton";
import { updateItemNameAction, updateSectionNameAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplateDetail(id);
  if (!template) notFound();

  const importRecord = await getImportForTemplate(id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Source: {template.sourceFilename ?? template.sourceFormat} &middot; {template.sections.length}{" "}
            sections
          </p>
        </div>
        <DuplicateButton templateId={template.id} />
      </div>

      {importRecord && importRecord.warnings.length > 0 && (
        <details className="border border-amber-300 bg-amber-50 rounded-md p-3">
          <summary className="text-sm font-medium text-amber-900 cursor-pointer">
            Imported with {importRecord.warnings.length} warning
            {importRecord.warnings.length > 1 ? "s" : ""} - unsupported or skipped content is
            listed here, nothing was silently dropped
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-amber-800 list-disc list-inside max-h-64 overflow-y-auto">
            {importRecord.warnings.map((w, i) => (
              <li key={i}>
                {w.rowNumber ? <span className="font-mono text-xs">[row {w.rowNumber}] </span> : null}
                {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="space-y-3">
        {template.sections.map((section) => (
          <details key={section.id} className="border border-neutral-200 rounded-lg bg-white group">
            <summary className="p-4 cursor-pointer flex items-center gap-3 list-none [&::-webkit-details-marker]:hidden">
              <span className="text-neutral-400 group-open:rotate-90 transition-transform">&rsaquo;</span>
              <EditableField
                initialValue={section.name}
                ariaLabel={`Section name: ${section.name}`}
                className="font-semibold bg-transparent border-b border-dashed border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
                onSave={updateSectionNameAction.bind(null, template.id, section.id)}
              />
              <span className="text-xs text-neutral-400">({section.items.length} items)</span>
            </summary>
            <div className="border-t border-neutral-100 px-4 py-3 space-y-3">
              {section.items.map((item) => (
                <details key={item.id} className="border border-neutral-100 rounded-md group/item">
                  <summary className="p-3 cursor-pointer flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden bg-neutral-50">
                    <span className="text-neutral-400 group-open/item:rotate-90 transition-transform text-sm">
                      &rsaquo;
                    </span>
                    <EditableField
                      initialValue={item.name}
                      ariaLabel={`Item name: ${item.name}`}
                      className="text-sm font-medium bg-transparent border-b border-dashed border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
                      onSave={updateItemNameAction.bind(null, template.id, item.id)}
                    />
                    <span className="text-xs text-neutral-400">({item.comments.length} comments)</span>
                  </summary>
                  <ul className="p-3 space-y-2">
                    {item.comments.map((comment) => (
                      <CommentCard key={comment.id} templateId={template.id} comment={comment} />
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
