"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages that sit under a header link without sharing its path.
const ALSO: Record<string, string[]> = { "/": ["/equipment"], "/bookings": ["/handover"] };

/** A header link that marks the page you are on (aria-current plus a white bar under it). */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const current = (href === "/" ? path === "/" : path.startsWith(href)) || (ALSO[href] ?? []).some((p) => path.startsWith(p));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-y-4 border-t-transparent ${
        current ? "border-b-on-brand" : "border-b-transparent hover:border-b-on-brand/50"
      }`}
    >
      {children}
    </Link>
  );
}
