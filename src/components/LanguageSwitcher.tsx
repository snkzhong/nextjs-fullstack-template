// components/LanguageSwitcher.tsx
'use client'; // 这是一个客户端组件

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';

// 语言映射
const languages = {
  en: 'English',
  zh: '中文'
};

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  // 切换语言的处理函数
  const switchLanguage = (newLocale: string) => {
    // 从路径中移除当前 locale
    const segments = pathname.split('/');
    segments[1] = newLocale; // segments[1] 是 locale 段
    const newPath = segments.join('/');
    
    // 使用 router 切换，并设置 cookie
    router.push(newPath);
  };

  return (
    <div className="flex space-x-4">
      {Object.entries(languages).map(([code, name]) => (
        <button
          key={code}
          onClick={() => switchLanguage(code)}
          disabled={locale === code}
          className={`px-3 py-1 rounded ${
            locale === code 
              ? 'bg-gray-300 cursor-not-allowed' 
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}