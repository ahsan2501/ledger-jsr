import { addDays, toNum } from "./format";
import type { Expense } from "./types";

export type SpendGroup = { key: string; total: number; count: number; share: number };

function group(list: Expense[], by: (e: Expense) => string): SpendGroup[] {
  const m = new Map<string, { total: number; count: number }>();
  for (const e of list) {
    const k = by(e);
    const g = m.get(k) ?? { total: 0, count: 0 };
    g.total += toNum(e.amount); g.count++;
    m.set(k, g);
  }
  const all = [...m.values()].reduce((s, g) => s + g.total, 0) || 1;
  return [...m.entries()].map(([key, g]) => ({ key, ...g, share: g.total / all })).sort((a, b) => b.total - a.total);
}

/** Totals for a set of expenses in one period. */
export function summariseSpending(list: Expense[], today: string) {
  const sum = (xs: Expense[]) => xs.reduce((s, e) => s + toNum(e.amount), 0);
  const week = addDays(today, -6);
  return {
    total: sum(list),
    today: sum(list.filter((e) => e.spent_on === today)),
    last7: sum(list.filter((e) => e.spent_on >= week && e.spent_on <= today)),
    count: list.length,
    byCategory: group(list, (e) => e.category),
    byMode: group(list, (e) => e.payment_mode),
  };
}

/** "2026-11" → first and last day of that month. */
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}
export function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
