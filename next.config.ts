import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  output: 'standalone', // 生成独立部署包
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  trailingSlash: true
  
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
