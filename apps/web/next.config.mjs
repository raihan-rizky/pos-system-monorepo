import prismaWorkaround from "@prisma/nextjs-monorepo-workaround-plugin";

const { PrismaPlugin } = prismaWorkaround;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@pos/ui", "@pos/db", "@pos/config"],

  async rewrites() {
    return [
      {
        source: "/wa/:path*",
        destination: "/wa",
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },

  // Disable strict mode double-renders because dev checkout flow testing is latency-sensitive.
  reactStrictMode: false,

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400, // 24h browser cache for optimized images
    localPatterns: [{ pathname: "/images/**" }],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pjgkfajkunbpwiyovtnc.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Production security & performance
  compress: true,
  poweredByHeader: false,

  // Tree-shake large packages; only ship code that is actually used.
  experimental: {
    optimizePackageImports: [
      "recharts",
      "react-markdown",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
};

export default nextConfig;
