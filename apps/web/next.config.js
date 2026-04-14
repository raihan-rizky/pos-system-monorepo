/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@pos/ui", "@pos/db", "@pos/config"],

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400, // 24h browser cache for optimized images
    localPatterns: [{ pathname: "/images/**" }],
  },

  // Production security & performance
  compress: true,
  poweredByHeader: false,

  // Tree-shake large packages — only ship code that is actually used
  experimental: {
    optimizePackageImports: ["recharts", "react-markdown"],
  },
};

module.exports = nextConfig;
