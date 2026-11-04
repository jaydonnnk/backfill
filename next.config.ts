import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // next dev would otherwise write its own agent instructions file into the repository.
  agentRules: false,
  // A menu photo is at most 4 MiB (src/domain/onboarding/menu.ts); the rest is multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }, { source: "/merchant/access", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }];
  },
};

export default nextConfig;
