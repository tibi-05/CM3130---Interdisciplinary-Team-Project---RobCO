"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Counts = { unread: number; pending: number };

// One request per page change, shared by every badge in the header.
let inflight: { path: string; promise: Promise<Counts> } | null = null;
const load = (path: string) => {
  if (inflight?.path !== path) {
    const promise = fetch("/api/header-counts", { cache: "no-store" }).then((r) => r.json() as Promise<Counts>);
    inflight = { path, promise };
    promise.finally(() => {
      if (inflight?.promise === promise) inflight = null; // only shared while in flight; a later visit asks again
    });
  }
  return inflight.promise;
};

/** A header badge that refreshes on client-side navigation (the server renders the first value). */
export function LiveCount({ which, initial, label }: { which: keyof Counts; initial: number; label: string }) {
  const path = usePathname();
  const [n, setN] = useState(initial);
  const rendered = useRef(path); // the page the server rendered this value for

  useEffect(() => {
    if (path === rendered.current) return; // already current for this page
    rendered.current = path;
    let live = true;
    load(path)
      .then((c) => live && setN(c[which]))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, which]);

  if (!n) return null;
  return (
    <span className="ml-1.5 inline-block min-w-5 bg-on-brand px-1.5 text-center text-xs font-extrabold leading-5 text-rgu-purple tabular-nums">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
