import { LogoutButton } from "@/components/LogoutButton";
import { NavTabs } from "@/components/NavTabs";
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
      <NavTabs links={LINKS} elderly={elderly} />
      <div className="flex items-center gap-3">
        <LogoutButton elderly={elderly} />
      </div>
    </nav>
  );
}
