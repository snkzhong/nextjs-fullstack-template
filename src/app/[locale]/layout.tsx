import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale, getMessages } from 'next-intl/server';
import { routing } from '~/i18n/routing';
import Header from '~/components/Header'; // 我们稍后创建

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
};

export default async function LocaleLayout({
  children,
  params
}: Props) {
  const {locale} = await params;
  // 验证 locale
  // if (!locales.includes(locale)) notFound();
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // 获取当前语言的 messages
  const messages = await getMessages();
  console.log("messages:", messages);

  return (
    <html lang={locale}>
      <body>
        {/* 提供翻译上下文 */}
        <NextIntlClientProvider messages={messages}>
          <Header locale={locale} />
          <main className="p-8">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}