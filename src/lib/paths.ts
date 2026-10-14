/** Only ever redirect within this site: anything else (//host, /\host, http://…) becomes "/". */
export function safePath(input: string | null | undefined): URL {
  const base = "http://local";
  try {
    const url = new URL(input || "/", base);
    if (url.origin === base && !url.pathname.startsWith("//")) return url;
  } catch {}
  return new URL("/", base);
}
