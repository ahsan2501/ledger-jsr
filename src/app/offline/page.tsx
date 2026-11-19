export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
      <img src="/icons/icon-192.png" alt="" width={56} height={56} className="mx-auto mb-4 rounded-2xl" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-muted">
        Your finances and JSR live securely on the server and are never stored on this device, so they need a connection.
        Reconnect and try again.
      </p>
      {/* full reload on purpose: the client router may be unavailable offline */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-6 inline-flex justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-text">Try again</a>
    </main>
  );
}
