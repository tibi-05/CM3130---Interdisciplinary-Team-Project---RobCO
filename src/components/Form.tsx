"use client";

import { startTransition, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & { action: (f: FormData) => unknown };

/**
 * A form for a server action that keeps what was typed when the action sends back ?error=.
 * React clears a form after every `<form action>` submit; here the action runs from onSubmit instead,
 * so nothing is cleared until the action reports success (?ok=). Without JavaScript it posts normally.
 */
export function Form({ action, ...props }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const ok = useSearchParams().get("ok");
  useEffect(() => {
    if (ok) ref.current?.reset(); // fields go back to the page's (fresh) defaults
  }, [ok]);

  return (
    <form
      {...props}
      ref={ref}
      action={action as (f: FormData) => void}
      onSubmit={(e) => {
        e.preventDefault(); // stops React's own submit, which would clear the form
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        // Drop the old message so the same ?ok= text coming back still counts as a change.
        const url = new URL(location.href);
        url.searchParams.delete("ok");
        url.searchParams.delete("error");
        history.replaceState(history.state, "", url);
        startTransition(() => action(data) as void);
      }}
    />
  );
}
