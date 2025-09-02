// next-intl.config.js
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

// 支持的语言
const locales = ['en', 'zh'];

export default getRequestConfig(async ({ locale }) => {
  // 验证 locale 是否支持
  if (!locales.includes(locale)) notFound();

  // 加载对应语言的 JSON 文件
  return {
    messages: (await import(`../messages/${locale}.json`)).default
  };
});