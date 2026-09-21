import { notFound } from "next/navigation";
import { getImportForTemplate, getTemplateDetail } from "@/db/repo";
import { EditableField } from "./EditableField";
import { CommentCard } from "./CommentCard";
import { DuplicateButton } from "./DuplicateButton";
import { DeleteTemplateButton } from "./DeleteTemplateButton";
import { Accordion } from "./Accordion";
import { EditorStatusProvider } from "./EditorStatusContext";
import { EditorStatusBar } from "./EditorStatusBar";
import { updateItemNameAction, updateSectionNameAction } from "@/app/actions";
import { AlertIcon, ChevronIcon } from "@/app/_components/icons";

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
    <EditorStatusProvider>
      <div className="space-y-6">
        <EditorStatusBar />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
              Editing template
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{template.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Source: {template.sourceFilename ?? template.sourceFormat} &middot; {template.sections.length}{" "}
              sections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DuplicateButton templateId={template.id} />
            <DeleteTemplateButton templateId={template.id} templateName={template.name} />
          </div>
        </div>

        {importRecord && importRecord.warnings.length > 0 && (
          <details className="border border-amber-200 bg-amber-50 rounded-xl p-4 group">
            <summary className="flex items-center gap-2 text-sm font-medium text-amber-900 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <AlertIcon className="text-amber-500 shrink-0" />
              Imported with {importRecord.warnings.length} warning
              {importRecord.warnings.length > 1 ? "s" : ""} - unsupported or skipped content is
              listed here, nothing was silently dropped
              <ChevronIcon className="text-amber-500 ml-auto group-open:rotate-90 transition-transform shrink-0" />
            </summary>
            <ul className="mt-3 space-y-1 text-sm text-amber-800 list-disc list-inside max-h-64 overflow-y-auto pl-1">
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
            <Accordion
              key={section.id}
              className="border border-gray-200 rounded-xl bg-white shadow-sm group"
              summary={
                <summary className="p-4 cursor-pointer flex items-center gap-3 list-none [&::-webkit-details-marker]:hidden hover:bg-gray-50/60 rounded-xl transition-colors">
                  <ChevronIcon className="text-gray-400 group-open:rotate-90 transition-transform shrink-0" />
                  <EditableField
                    initialValue={section.name}
                    ariaLabel={`Section name: ${section.name}`}
                    fieldId={`section-name-${section.id}`}
                    className="font-semibold text-gray-900 bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none"
                    onSave={updateSectionNameAction.bind(null, template.id, section.id)}
                  />
                  <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 border border-gray-100">
                    {section.items.length} items
                  </span>
                </summary>
              }
            >
              <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                {section.items.map((item) => (
                  <Accordion
                    key={item.id}
                    className="border border-gray-100 rounded-lg group/item"
                    summary={
                      <summary className="p-3 cursor-pointer flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden bg-gray-50/70 rounded-lg hover:bg-gray-50 transition-colors">
                        <ChevronIcon className="text-gray-400 group-open/item:rotate-90 transition-transform shrink-0" width={12} height={12} />
                        <EditableField
                          initialValue={item.name}
                          ariaLabel={`Item name: ${item.name}`}
                          fieldId={`item-name-${item.id}`}
                          className="text-sm font-medium text-gray-800 bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none"
                          onSave={updateItemNameAction.bind(null, template.id, item.id)}
                        />
                        <span className="text-xs text-gray-400">{item.comments.length} comments</span>
                      </summary>
                    }
                  >
                    <ul className="p-3 space-y-2">
                      {item.comments.map((comment) => (
                        <CommentCard key={comment.id} templateId={template.id} comment={comment} />
                      ))}
                    </ul>
                  </Accordion>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      </div>
    </EditorStatusProvider>
  );
}
