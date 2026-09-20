import Link from "next/link";
import { listTemplates } from "@/db/repo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-neutral-500 mt-1">
          Inspection templates migrated from Spectora exports, ready to edit and reuse.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-lg p-10 text-center text-neutral-500">
          <p>No templates yet.</p>
          <Link href="/import" className="text-neutral-900 underline mt-2 inline-block">
            Import a Spectora export to get started
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg bg-white">
          {templates.map((t) => (
            <li key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <Link href={`/templates/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <div className="text-sm text-neutral-500 mt-0.5">
                  Source: {t.sourceFilename ?? t.sourceFormat} &middot; Imported{" "}
                  {t.createdAt.toLocaleDateString()}
                </div>
              </div>
              <Link
                href={`/templates/${t.id}`}
                className="text-sm font-medium text-neutral-700 border border-neutral-300 rounded-md px-3 py-1.5 hover:bg-neutral-100 shrink-0"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
