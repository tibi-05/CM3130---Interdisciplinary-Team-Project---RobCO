// Labelled form controls, so every field has a visible label and hint wired to it.
import { useId } from "react";

type Base = { label: string; hint?: string; className?: string };

export function TextField({ label, hint, className = "", ...input }: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 font-semibold ${className}`}>
      {label}
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="field font-normal" {...input} />
      {hint && (
        <span id={`${id}-hint`} className="text-sm font-normal text-neutral-700">
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextArea({ label, hint, className = "", ...area }: Base & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 font-semibold ${className}`}>
      {label}
      <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="field font-normal" rows={3} {...area} />
      {hint && (
        <span id={`${id}-hint`} className="text-sm font-normal text-neutral-700">
          {hint}
        </span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  options,
  className = "",
  ...select
}: Base & { options: readonly string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 font-semibold ${className}`}>
      {label}
      <select id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="field font-normal" {...select}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {hint && (
        <span id={`${id}-hint`} className="text-sm font-normal text-neutral-700">
          {hint}
        </span>
      )}
    </label>
  );
}
