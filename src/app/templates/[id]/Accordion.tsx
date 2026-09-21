"use client";

import { useState, type ReactNode } from "react";

/**
 * A `<details>` whose open/closed state lives in this Client Component's
 * own `useState` instead of the browser's native, uncontrolled `open`
 * attribute. Every field save on this page calls `revalidatePath` for the
 * template route, which re-runs the (Server Component) page and rebuilds
 * the DOM subtree it owns - a raw uncontrolled `<details open>` loses its
 * state when that happens, but a Client Component's hook state does not
 * (React preserves a Client Component's fiber/state across an RSC refresh
 * as long as its type and key stay the same, independent of the
 * surrounding server-rendered markup being rebuilt around it). Controlling
 * `open` here is what keeps a section/item expanded across every save
 * instead of collapsing the whole tree back to closed.
 */
export function Accordion({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={className}
    >
      {summary}
      {children}
    </details>
  );
}
