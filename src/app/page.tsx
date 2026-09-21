import Link from "next/link";
import { listTemplates } from "@/db/repo";
import { DuplicateButton } from "./templates/[id]/DuplicateButton";
import { DeleteTemplateButton } from "./templates/[id]/DeleteTemplateButton";
import { TemplatesIcon } from "./_components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Templates</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Inspection templates migrated from Spectora exports, ready to edit and reuse.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl bg-white p-12 text-center">
          <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <TemplatesIcon width={20} height={20} />
          </div>
          <p className="text-gray-600 text-sm">No templates yet.</p>
          <Link
            href="/import"
            className="inline-flex items-center mt-3 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Import a Spectora export to get started
          </Link>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Imported</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <Link
                      href={`/templates/${t.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{t.sourceFilename ?? t.sourceFormat}</td>
                  <td className="px-5 py-4 text-gray-500">{t.createdAt.toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/templates/${t.id}`}
                        className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      >
                        Open
                      </Link>
                      <DuplicateButton templateId={t.id} />
                      <DeleteTemplateButton templateId={t.id} templateName={t.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
