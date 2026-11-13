import Link from "next/link";

/**
 * Every screen opens the same way: a panel-blue band holding RGU's angled purple title panel.
 * `aside` sits beside the panel (a page-level action); `children` sit under it, still on the band.
 */
export function PageHead({
  title,
  sub,
  back,
  aside,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-rgu-panel">
      <div className="mx-auto max-w-6xl px-4 pt-3 pb-6 sm:pt-5 sm:pb-8">
        {back}
        <div className={`flex flex-wrap items-end justify-between gap-4 ${back ? "mt-4" : "mt-3"}`}>
          <div className="angled max-w-full bg-rgu-purple-dark py-4 pl-5 pr-16 text-on-brand sm:py-5 sm:pl-6 sm:pr-20">
            <h1 className="text-[1.75rem] leading-[1.05] font-extrabold uppercase sm:text-4xl">{title}</h1>
            {sub && <div className="mt-1.5 leading-snug sm:mt-2 sm:text-lg">{sub}</div>}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}

/** "Back to" link with a drawn chevron, so no arrow character is glued to the words. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-rgu-blue-dark underline underline-offset-4 hover:decoration-2">
      <Chevron dir="left" />
      {children}
    </Link>
  );
}

export function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square">
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}

/** What a page shows to a role that can't use it: the page's title, then how to get access. */
export function Denied({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <PageHead title={title} />
      <p className="mx-auto max-w-6xl px-4 pt-6">{children}</p>
    </>
  );
}
