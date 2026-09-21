import { translations, type TranslationKey } from "@/lib/i18n";

/**
 * A bilingual label for elderly mode: Japanese shown large/first, English
 * small underneath as a secondary reference for anyone cross-checking
 * against the English business terms elsewhere. Renders plain English
 * (the original, unchanged look) when elderly mode is off.
 */
export function T({ k, elderly }: { k: TranslationKey; elderly: boolean }) {
  const entry = translations[k];
  if (!elderly) return <>{entry.en}</>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{entry.ja}</span>
      <span className="text-xs font-normal text-gray-400">{entry.en}</span>
    </span>
  );
}
