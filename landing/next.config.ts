import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/switchboard",
  images: { unoptimized: true },
};

export default nextConfig;
