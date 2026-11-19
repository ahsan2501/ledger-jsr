"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconBriefcase, IconHome, IconSearch, IconSettings, IconWallet } from "./icons";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/finance", label: "Finance", icon: IconWallet },
  { href: "/work", label: "Work", icon: IconBriefcase },
  { href: "/settings", label: "Settings", icon: IconSettings },
];
const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Main">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={cx("flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px]", isActive(path, href) ? "text-accent" : "text-muted")}
              aria-current={isActive(path, href) ? "page" : undefined}>
              <Icon />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="hidden md:block" aria-label="Main">
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", isActive(path, href) ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-surface-2")}>
              <Icon />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TopBar({ inboxCount }: { inboxCount: number }) {
  return (
    <div className="flex items-center gap-2">
      <form action="/search" className="relative flex-1 md:max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
        <input name="q" type="search" placeholder="Search people, lenders, clients, invoices…" aria-label="Search"
          className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-[16px] outline-none focus:border-accent md:text-sm" />
      </form>
      <Link href="/inbox" className="relative rounded-xl border border-line bg-surface p-2" aria-label={`Reminders inbox, ${inboxCount} unread`}>
        <IconBell />
        {inboxCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-white">{inboxCount > 99 ? "99+" : inboxCount}</span>
        ) : null}
      </Link>
    </div>
  );
}
