"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImportIcon } from "./icons";

function pageLabel(pathname: string): string {
  if (pathname === "/") return "Templates";
  if (pathname.startsWith("/import")) return "Import";
  if (pathname.startsWith("/templates")) return "Template";
  return "";
}

export function TopBar() {
  const pathname = usePathname();
  const label = pageLabel(pathname);
  const onImportPage = pathname.startsWith("/import");

  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="flex items-center justify-between px-5 md:px-8 h-16">
        <div className="flex items-center gap-2 text-sm">
          <span className="md:hidden font-semibold text-gray-900">Hive Inspect</span>
          <span className="hidden md:inline text-gray-400">Template Importer</span>
          {label && (
            <>
              <span className="hidden md:inline text-gray-300">/</span>
              <span className="font-medium text-gray-900">{label}</span>
            </>
          )}
        </div>

        {!onImportPage && (
          <Link
            href="/import"
            className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white px-3.5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ImportIcon width={16} height={16} />
            Import template
          </Link>
        )}
      </div>
    </header>
  );
}
