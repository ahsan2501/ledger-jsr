import "server-only";
import * as webpush from "web-push";

export type PushSub = { id: string; owner_id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };
export type PushSender = (sub: PushSub, payload: PushPayload) => Promise<PushResult>;

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  if (!pushConfigured()) throw new Error("Web Push is not configured (VAPID keys missing)");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:owner@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export const webPushSender: PushSender = async (sub, payload) => {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12, urgency: "normal", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) },
    );
    return { ok: true };
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, error: `${status ?? ""} ${(e as Error).message}`.trim() };
  }
};

/** Lock-screen text. Discreet by default: no amounts or names. */
export function payloadFor(r: { id: string; title: string; detail: string; href: string | null }, discreet: boolean): PushPayload {
  return discreet
    ? { title: "Reminder", body: "You have something due. Open the app for details.", url: "/inbox", tag: r.id }
    : { title: r.title, body: r.detail, url: r.href || "/inbox", tag: r.id };
}
