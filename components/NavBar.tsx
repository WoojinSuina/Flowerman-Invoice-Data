import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { T } from "@/components/T";
import { isElderlyMode } from "@/lib/elderlyMode";
import type { TranslationKey } from "@/lib/i18n";

const LINKS: { href: string; key: TranslationKey }[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/jobs", key: "jobs" },
  { href: "/review", key: "review" },
  { href: "/recommendations", key: "recommendations" },
  { href: "/reconciliation", key: "reconciliation" },
  { href: "/stores", key: "stores" },
  { href: "/products", key: "products" },
];

export async function NavBar() {
  const elderly = await isElderlyMode();
  return (
    <nav
      className={
        elderly
          ? "mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 pb-4"
          : "mb-6 flex items-center justify-between border-b pb-4"
      }
    >
      <div className={elderly ? "flex flex-wrap gap-6" : "flex gap-4"}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={elderly ? "text-blue-700 underline" : "text-sm text-blue-600 underline"}
          >
            <T k={link.key} elderly={elderly} />
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <LogoutButton elderly={elderly} />
      </div>
    </nav>
  );
}
