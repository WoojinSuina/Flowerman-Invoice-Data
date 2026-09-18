import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/review", label: "Review" },
  { href: "/jobs", label: "Jobs" },
  { href: "/stores", label: "Stores" },
  { href: "/products", label: "Products" },
  { href: "/recommendations", label: "Recommendations" },
];

export function NavBar() {
  return (
    <nav className="mb-6 flex items-center justify-between border-b pb-4">
      <div className="flex gap-4">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm text-blue-600 underline">
            {link.label}
          </Link>
        ))}
      </div>
      <LogoutButton />
    </nav>
  );
}
