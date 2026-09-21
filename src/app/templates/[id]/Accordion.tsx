"use client";

import { useState, type ReactNode } from "react";

// `<details>` with its open state in useState, not the native uncontrolled
// `open` attribute - a controlled Client Component keeps its state across
// the page's `revalidatePath` refresh on every save, where the native
// attribute would otherwise reset to closed.
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
