/** Shows the ?ok= / ?error= message an action redirected back with. */
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mb-6 border-l-4 px-4 py-3 font-semibold ${
        error ? "border-overdue bg-overdue-bg text-overdue" : "border-free bg-free-bg text-free"
      }`}
    >
      {error ?? ok}
    </p>
  );
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
