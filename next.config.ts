import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // X не принимает localhost в callback URL — локально работаем на 127.0.0.1
  allowedDevOrigins: ["127.0.0.1"],
  // Прокси PostHog (EU)
  rewrites: async () => [
    { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
    { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
  ],
  skipTrailingSlashRedirect: true,
  headers: async () => [{
    source: "/:path*",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ],
  }],
};

export default nextConfig;
