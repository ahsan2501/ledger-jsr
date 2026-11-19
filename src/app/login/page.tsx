import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <img src="/icons/icon-192.png" alt="" width={56} height={56} className="mb-4 rounded-2xl" />
      <h1 className="text-2xl font-semibold">Ledger + JSR</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Private. Sign in to see what to pay, chase and deliver today.</p>
      <LoginForm signupEnabled={process.env.ALLOW_SIGNUP === "true"} notAllowed={sp.error === "not_allowed"} />
    </main>
  );
}
