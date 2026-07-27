import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads (src/app/actions/avatars.ts) go up to 2 MB; the multipart
      // envelope adds overhead on top of that, so leave headroom above the 1 MB default.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
