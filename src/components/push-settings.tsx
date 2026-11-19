"use client";
import { useEffect, useState } from "react";
import { btn } from "./ui";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on" | "not-configured";

export function PushSettings({ vapidKey, deviceCount }: { vapidKey: string | null; deviceCount: number }) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vapidKey) return setState("not-configured");
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save subscription");
      setState("on"); setMsg("Notifications are on for this device.");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off"); setMsg("Notifications are off for this device. In-app reminders still work.");
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = await res.json();
      setMsg(res.ok ? `Test sent to ${j.sent} device${j.sent === 1 ? "" : "s"}${j.failed ? ` (${j.failed} failed)` : ""}.` : j.error);
    } finally { setBusy(false); }
  }

  const text: Record<State, string> = {
    checking: "Checking this device…",
    "not-configured": "Push isn't configured on the server yet (VAPID keys missing). In-app reminders still work.",
    unsupported: "This browser doesn't support Web Push. In-app reminders still work.",
    "needs-install": "On iPhone, push only works after you add this app to your Home Screen (see below) and open it from there.",
    denied: "Notifications are blocked for this site. Re-enable them in your browser / iOS Settings → Notifications.",
    off: "Push is off on this device.",
    on: "Push is on for this device.",
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">{text[state]} <span className="text-muted">({deviceCount} device{deviceCount === 1 ? "" : "s"} subscribed)</span></p>
      <div className="flex flex-wrap gap-2">
        {state === "off" ? <button className={btn.primary} disabled={busy} onClick={enable}>Enable notifications</button> : null}
        {state === "on" ? <button className={btn.secondary} disabled={busy} onClick={disable}>Turn off on this device</button> : null}
        <button className={btn.secondary} disabled={busy || deviceCount === 0 && state !== "on"} onClick={test}>Send test notification</button>
      </div>
      {msg ? <p role="status" className="text-sm text-muted">{msg}</p> : null}
    </div>
  );
}
