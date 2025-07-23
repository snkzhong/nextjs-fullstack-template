import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // 生成独立部署包
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  trailingSlash: true
  
};

export default nextConfig;
