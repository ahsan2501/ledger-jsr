"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; info?: string } | null;

function allowed(email: string) {
  const list = (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email.toLowerCase());
}

export async function login(_: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const mode = fd.get("mode") === "signup" ? "signup" : "signin";
  if (!email || !password) return { error: "Enter your email and password." };
  if (!allowed(email)) return { error: "This is a private app. That email isn't allowed." };
  const sb = await createClient();
  if (mode === "signup") {
    if (process.env.ALLOW_SIGNUP !== "true") return { error: "Sign-up is turned off. Set ALLOW_SIGNUP=true to create the owner account once." };
    if (password.length < 10) return { error: "Use at least 10 characters." };
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { info: "Check your email to confirm the account, then sign in." };
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: "Email or password is incorrect." };
  }
  redirect("/");
}
