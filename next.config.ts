import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  trailingSlash: true,
  async redirects() {
    return [
      {
        source: "/:locale/agenda",
        destination: "/:locale",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
