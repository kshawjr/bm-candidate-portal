"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  {
    href: "/admin/content",
    label: "Content",
    match: (p) => p.startsWith("/admin/content"),
  },
  {
    href: "/admin/candidates",
    label: "Candidates",
    match: (p) => p.startsWith("/admin/candidates"),
  },
  {
    href: "/admin/structure",
    label: "Structure",
    match: (p) => p.startsWith("/admin/structure"),
  },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const brand = searchParams?.get("brand");
  const suffix = brand ? `?brand=${encodeURIComponent(brand)}` : "";

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={`${item.href}${suffix}`}
            className={`admin-navlink${active ? " admin-navlink-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
      <span className="admin-navlink admin-navlink-disabled">
        Settings <small>Coming soon</small>
      </span>
    </>
  );
}
