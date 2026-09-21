"use client";

import { useRouter } from "next/navigation";
import { ELDERLY_MODE_COOKIE } from "@/lib/elderlyModeCookie";

export function ElderlyModeToggle({ elderly }: { elderly: boolean }) {
  const router = useRouter();

  function toggle() {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${ELDERLY_MODE_COOKIE}=${elderly ? "0" : "1"}; path=/; max-age=${oneYear}`;
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        elderly
          ? "rounded border border-gray-400 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          : "rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
      }
    >
      {elderly ? "文字を元に戻す (Normal text)" : "大きな文字 / Large Text"}
    </button>
  );
}
