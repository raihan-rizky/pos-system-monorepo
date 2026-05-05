/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling Prisma — the native query engine binary
  // must stay in node_modules so Vercel's runtime can find it.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],

  transpilePackages: ["@pos/ui", "@pos/db", "@pos/config"],

  // Disable strict mode double-renders — this is a POS cash register,
  // dev performance matters for testing checkout flows.
  reactStrictMode: false,

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
    optimizePackageImports: [
      "recharts",
      "react-markdown",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
};

module.exports = nextConfig;

