import {notFound} from 'next/navigation';
import {TranslationProvider} from '../../components/TranslationProvider';
import "../globals.css";

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  // Await params in Next.js 15
  const { locale } = await params;

  // Validate the locale
  const locales = ['en', 'zh-TW', 'zh-CN'];
  if (!locales.includes(locale)) {
    notFound();
  }

  // Manually import JSON file based on locale
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <html lang={locale}>
      <body>
        <TranslationProvider locale={locale} messages={messages}>
          {children}
        </TranslationProvider>
      </body>
    </html>
  );
}
