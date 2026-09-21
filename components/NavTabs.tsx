"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { T } from "@/components/T";
import type { TranslationKey } from "@/lib/i18n";

/**
 * The main nav links as pill tabs, matching the active-chip style already
 * used elsewhere in the app (Review's status filters, Jobs). Needs the
 * current path to know which tab is active, hence a small client
 * component — the bilingual <T> label itself has no server-only
 * dependencies, so it renders fine here too.
 */
export function NavTabs({
  links,
  elderly,
}: {
  links: { href: string; key: TranslationKey }[];
  elderly: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((link) => {
        const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            }
          >
            <T k={link.key} elderly={elderly} />
          </Link>
        );
      })}
    </div>
  );
}
