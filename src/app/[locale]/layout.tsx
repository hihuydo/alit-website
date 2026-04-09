import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Logo } from "@/components/Logo";
import { Wrapper } from "@/components/Wrapper";
import { journalEntries } from "@/content/de/journal/entries";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const dict = getDictionary(locale as Locale);

  return (
    <html lang={locale} className="h-full">
      <body className="h-full overflow-hidden">
        <Logo locale={locale} />
        <Wrapper locale={locale} journalEntries={journalEntries} dict={dict}>
          {children}
        </Wrapper>
      </body>
    </html>
  );
}
