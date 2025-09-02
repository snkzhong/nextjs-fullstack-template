import {cookies} from 'next/headers';
import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {notFound} from 'next/navigation';
import {routing} from './routing';
 
export default getRequestConfig(async ({requestLocale}) => {

  // 手动兜底验证
  // if (!routing.locales.includes(locale as any)) {
  //   notFound(); // 触发 404
  // }

  // const store = await cookies();
  // const locale = store.get('locale')?.value || 'zh';

  const locale = await requestLocale;
  console.log('requested locale:', locale);
  const _locale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
 
  return {
    locale: _locale,
    messages: (await import(`../../messages/${_locale}.json`)).default
  };
});