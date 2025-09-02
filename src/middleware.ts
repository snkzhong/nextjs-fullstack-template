import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import createMiddleware from 'next-intl/middleware';
import {routing} from '~/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 提前验证语言参数
  const pathLocale = pathname.split('/')[1];
  console.log('pathLocale:', pathLocale);
  if (!routing.locales.includes(pathLocale)) {
    // 重定向到默认语言或404页面
    return new NextResponse(null, { status: 404 });
    // return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url));
  }

  const intlRes = intlMiddleware(request);
  if (intlRes) {
    
  }

  return NextResponse.next();
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/trpc`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)']
};