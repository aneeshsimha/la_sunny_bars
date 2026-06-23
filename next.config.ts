import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

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

const analyzedConfig = analyze(nextConfig);

export default withSentryConfig(analyzedConfig, {
  // Only upload source maps when SENTRY_DSN is configured
  silent: !process.env.SENTRY_DSN,
  // Disable source map upload in dev (no auth token needed locally)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
