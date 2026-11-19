"use client";
import { useEffect, useState } from "react";

export function SwRegister() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-warn px-4 py-1.5 text-center text-xs font-medium text-white" style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}>
      You&apos;re offline. Your records live on the server and need a connection — nothing is stored on this device.
    </div>
  );
}
