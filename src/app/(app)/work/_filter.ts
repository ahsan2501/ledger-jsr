import type { JsrItem } from "@/lib/types";
export function filterJsr(items: JsrItem[], f: string, today: string, clientId?: string) {
  return items.filter((j) => {
    if (clientId && j.client_id !== clientId) return false;
    switch (f) {
      case "today": return j.is_active && ((!!j.action_due && j.action_due <= today && j.next_owner !== "client") || (!!j.follow_up_date && j.follow_up_date <= today));
      case "mine": return j.is_active && j.next_owner === "me" && !["sent_to_client", "waiting_for_client"].includes(j.status);
      case "client": return j.is_active && (j.next_owner === "client" || ["sent_to_client", "waiting_for_client"].includes(j.status));
      case "followup": return j.is_active && !!j.follow_up_date && j.follow_up_date <= today;
      case "invoice": return j.billing === "to_invoice";
      case "done": return !j.is_active;
      default: return j.is_active;
    }
  });
}
