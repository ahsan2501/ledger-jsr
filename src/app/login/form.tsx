"use client";
import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { Field, Submit, TextInput } from "@/components/forms";

export function LoginForm({ signupEnabled, notAllowed }: { signupEnabled: boolean; notAllowed: boolean }) {
  const [state, action] = useActionState<LoginState, FormData>(login, notAllowed ? { error: "That account isn't allowed in this private app." } : null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mode" value={mode} />
      <Field label="Email"><TextInput name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password"><TextInput name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required /></Field>
      {state?.error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state?.info ? <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">{state.info}</p> : null}
      <Submit label={mode === "signin" ? "Sign in" : "Create owner account"} />
      {signupEnabled ? (
        <button type="button" className="w-full text-center text-sm text-accent" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "First time? Create the owner account" : "Have an account? Sign in"}
        </button>
      ) : null}
    </form>
  );
}
