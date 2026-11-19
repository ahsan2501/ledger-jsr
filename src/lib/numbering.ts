import { todayIST } from "./format";

/** INV-2026-041 → INV-2026-042 */
export function nextNumber(last: string | undefined): string {
  if (!last) return `INV-${todayIST().slice(0, 4)}-001`;
  const m = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${last}-2`;
  const n = String(parseInt(m[2], 10) + 1).padStart(m[2].length, "0");
  return `${m[1]}${n}${m[3]}`;
}
