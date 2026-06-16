import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ["mapbox-gl", "suncalc"],
  },
};

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default analyze(nextConfig);
