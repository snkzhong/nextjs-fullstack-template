// import { use } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
// import { useTranslations } from 'next-intl';

export default async function HomePage() {
  
  const tRoot = await getTranslations();

  // Enable static rendering
  // setRequestLocale(locale);

  // 但我们的消息在根级别，所以直接用
  // const tRoot = useTranslations();

  return (
    <div>
      <h1>{tRoot('welcome')}</h1>
      <p>{tRoot('description')}</p>
      <p>{tRoot('currentLocale', { locale: 'en' })}</p>
    </div>
  );
}