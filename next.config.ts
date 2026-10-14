import type { NextConfig } from "next";

const mediaBlobHost = process.env.PROMI_MEDIA_BLOB_HOST?.trim().toLowerCase();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      ...(mediaBlobHost
        ? [{ protocol: "https" as const, hostname: mediaBlobHost, pathname: "/scheduled-images/**" }]
        : []),
    ],
  },
};

export default nextConfig;
