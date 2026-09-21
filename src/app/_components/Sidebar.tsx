"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TemplatesIcon, ImportIcon } from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "Templates", icon: TemplatesIcon, match: (p: string) => p === "/" || p.startsWith("/templates") },
  { href: "/import", label: "Import", icon: ImportIcon, match: (p: string) => p.startsWith("/import") },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-white border-r border-gray-200 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
          H
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-gray-900 text-sm">Hive Inspect</div>
          <div className="text-xs text-gray-400">Template Importer</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors " +
                (active
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")
              }
            >
              <Icon className={active ? "text-blue-600" : "text-gray-400"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
          ST
        </div>
        <div className="text-sm font-medium text-gray-900 truncate">Saher Thekedar</div>
      </div>
    </aside>
  );
}
