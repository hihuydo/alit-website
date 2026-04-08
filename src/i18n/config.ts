export const locales = ["de", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
