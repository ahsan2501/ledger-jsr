// INR formatting with Indian digit grouping (₹1,25,000) and Asia/Kolkata dates.

export const TZ = "Asia/Kolkata";

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** ₹1,25,000 — shows paise only when present. */
export function inr(v: unknown): string {
  const n = Math.round(toNum(v) * 100) / 100;
  return Number.isInteger(n) ? inr0.format(n) : inr2.format(n);
}

/** Compact Indian units for chart axes: ₹950, ₹45K, ₹1.2L, ₹3.4Cr */
export function inrCompact(v: unknown): string {
  const n = toNum(v);
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ""));
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** Parse "1,25,000" / "₹ 1,25,000.50" from a form field. Returns null if blank. */
export function parseAmount(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[₹,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a valid amount`);
  return Math.round(n * 100) / 100;
}

// ---------- dates (ISO yyyy-mm-dd, calendar days in IST) ----------

const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function todayIST(now: Date = new Date()): string {
  return isoFmt.format(now);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(a).getTime() - parseIso(b).getTime()) / 86400000);
}

export function monthBounds(iso: string): { start: string; end: string } {
  const d = parseIso(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short", year: "2-digit" });

/** "Mon, 24 Nov" (adds the year when it differs from this year) */
export function fmtDate(iso: string | null | undefined, today = todayIST()): string {
  if (!iso) return "—";
  const d = parseIso(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? dayFmt.format(d) : dayYearFmt.format(d);
}
export function fmtShort(iso: string | null | undefined): string {
  return iso ? shortFmt.format(parseIso(iso)) : "—";
}
/** "Oct ’26" — month + apostrophe year, so it can't be read as a date */
export function fmtMonth(iso: string): string {
  const parts = monthFmt.formatToParts(parseIso(iso));
  const m = parts.find((x) => x.type === "month")?.value ?? "";
  const y = parts.find((x) => x.type === "year")?.value ?? "";
  return `${m} ’${y}`;
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ts));
}

/** "today", "tomorrow", "in 4 days", "2 days overdue", "yesterday" */
export function relDue(iso: string | null | undefined, today = todayIST()): string {
  if (!iso) return "no due date";
  const n = diffDays(iso, today);
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  if (n > 1) return `due in ${n} days`;
  if (n === -1) return "1 day overdue";
  return `${-n} days overdue`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
