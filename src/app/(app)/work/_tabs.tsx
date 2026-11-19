import { Tabs } from "@/components/ui";
export function WorkTabs({ active }: { active: string }) {
  return <Tabs active={active} items={[
    { href: "/work", label: "JSR" },
    { href: "/work/board", label: "Board" },
    { href: "/work/invoices", label: "Invoices" },
    { href: "/work/clients", label: "Clients & projects" },
    { href: "/work/summary", label: "Weekly summary" },
  ]} />;
}
export const FILTERS = [
  { key: "all", label: "All active" },
  { key: "today", label: "Due today" },
  { key: "mine", label: "I owe a response" },
  { key: "client", label: "Waiting on client" },
  { key: "followup", label: "Follow up today" },
  { key: "invoice", label: "Invoice to send" },
  { key: "done", label: "Delivered & closed" },
] as const;
