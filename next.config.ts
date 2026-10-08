import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gdmissions.app",
        pathname: "/assets/11th/**",
        search: "",
      },
    ],
    qualities: [75, 90],
  },
};

export default nextConfig;
