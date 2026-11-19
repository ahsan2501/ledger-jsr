import { Tabs } from "@/components/ui";
export function FinanceTabs({ active }: { active: string }) {
  return <Tabs active={active} items={[
    { href: "/finance", label: "Due & overdue" },
    { href: "/finance/loans", label: "Loans" },
    { href: "/finance/cards", label: "Cards" },
    { href: "/finance/debts", label: "Money owed" },
    { href: "/finance/spending", label: "Spending" },
    { href: "/work/invoices", label: "Agency receivables" },
  ]} />;
}
