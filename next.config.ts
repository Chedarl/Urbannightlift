import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * These do not by themselves lift a Safe Browsing flag — nothing you can buy or
 * configure does that; only a review request in Google Search Console will. But
 * a site that collects a phone number and a PIN and displays mobile-money
 * merchant codes looks, to an automated classifier, uncomfortably like a
 * phishing page. Every signal that says "operated by people who know what they
 * are doing" is worth having, and clickjacking and MIME-sniffing protection are
 * worth having regardless of who is looking.
 */
const securityHeaders = [
  // Our login and payment screens must never be framed by somebody else's site —
  // that is exactly how a credential-harvesting overlay is built.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Hardware we genuinely use is granted to ourselves only: geolocation for
  // rider tracking, the microphone for voice notes. Everything else is denied
  // outright rather than left open.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Speed is a feature here — many customers are on weak mobile connections.
  // lucide-react is imported for a handful of icons across dozens of files; the
  // barrel would otherwise pull the whole set into each chunk, so tree-shaking
  // it per-import is the single biggest bundle win on the portal and admin.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
