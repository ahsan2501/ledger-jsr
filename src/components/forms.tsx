"use client";
import { createContext, useActionState, useContext, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { btn, cx } from "./ui";
import { IconCopy, IconX } from "./icons";

export type ActionResult = { ok: boolean; error?: string; message?: string } | null;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

// ---------- Sheet (bottom sheet on phones, dialog on desktop) ----------
const SheetCtx = createContext<{ close: () => void } | null>(null);
export const useSheet = () => useContext(SheetCtx);

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="pb-safe relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 shadow-xl sm:max-w-lg sm:rounded-3xl sm:pb-4">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Close"><IconX /></button>
        </div>
        <SheetCtx.Provider value={{ close: onClose }}>{children}</SheetCtx.Provider>
      </div>
    </div>
  );
}

export function SheetButton({ label, title, children, className, icon }: { label: ReactNode; title: string; children: ReactNode; className?: string; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? btn.small} onClick={() => setOpen(true)}>{icon}{label}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>{children}</Sheet>
    </>
  );
}

// ---------- Form wrapper ----------
export function ActionForm({ action, children, submitLabel = "Save", className, onDone, danger }: {
  action: FormAction; children?: ReactNode; submitLabel?: string; className?: string; onDone?: () => void; danger?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const sheet = useSheet();
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      onDone?.();
      sheet?.close();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className={cx("space-y-3", className)}>
      {children}
      {state?.error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <Submit label={submitLabel} danger={danger} />
    </form>
  );
}

export function Submit({ label, danger, className }: { label: string; danger?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(danger ? btn.danger : btn.primary, "w-full", className)}>
      {pending ? "Saving…" : label}
    </button>
  );
}

/** One-tap action button (e.g. Mark approved). Hidden fields go in `fields`. */
export function InlineAction({ action, fields, label, className, confirm }: {
  action: FormAction; fields: Record<string, string>; label: ReactNode; className?: string; confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={formAction} className="inline" onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <InlineSubmit label={label} className={className} />
      {state?.error ? <span role="alert" className="ml-2 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
function InlineSubmit({ label, className }: { label: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className ?? btn.small}>{pending ? "…" : label}</button>;
}

// ---------- Fields ----------
const inputCls = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[16px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
      <input inputMode="decimal" autoComplete="off" placeholder="0" {...props} className={cx(inputCls, "tabular pl-7", props.className)} />
    </div>
  );
}
export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" {...props} className={cx(inputCls, "min-h-[44px]", props.className)} />;
}
export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: readonly { value: string; label: string }[] }) {
  return (
    <select {...props} className={cx(inputCls, "appearance-none bg-[length:12px] pr-8", props.className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputCls, props.className)} />;
}
export function Check({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 py-1 text-sm">
      <input type="checkbox" {...props} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
      <span>{label}</span>
    </label>
  );
}
export function More({ children, label = "More options" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group rounded-xl border border-dashed border-line px-3 py-2">
      <summary className="text-sm font-medium text-accent">
        <span className="group-open:hidden">+ {label}</span><span className="hidden group-open:inline">− {label}</span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className={className ?? btn.small}>
      <IconCopy width={14} height={14} />{done ? "Copied" : label}
    </button>
  );
}
