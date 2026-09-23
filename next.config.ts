import type { NextConfig } from "next";

const SUPABASE_HOST = "jtmbnmpggzbucmgglisw.supabase.co";

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' restano per GA4 gtag, Stripe inline, gtag dataLayer.
  // Quando estirperemo gli script inline (Next.js Script con nonce) potremo stringere.
  // Sentry: `js-de.` è la CDN della regione UE, dove sta la nostra chiave; `js.`
  // resta per compatibilità. Il bundle SDK lo scarica poi il loader da
  // `browser.sentry-cdn.com`, senza suffisso di regione anche per le chiavi UE.
  // Se il DSN cambia regione, questa riga va aggiornata insieme al DSN:
  // l'URL in layout.tsx si adegua da solo, la CSP no, e il browser blocca.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com https://checkout.stripe.com https://connect.facebook.net https://vercel.live https://va.vercel-scripts.com https://eu-assets.i.posthog.com https://js.sentry-cdn.com https://js-de.sentry-cdn.com https://browser.sentry-cdn.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://www.google.com https://www.facebook.com https://vercel.live",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async redirects() {
    return [
      {
        source: "/chisiamo",
        destination: "/chi-siamo",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              'camera=(self), microphone=(), geolocation=(), interest-cohort=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")',
          },
          { key: "Content-Security-Policy", value: cspDirectives },
        ],
      },
      {
        source: "/(.*)\\.(png|jpg|jpeg|webp|avif|svg|ico)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, must-revalidate" }],
      },
      {
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  experimental: {
    // Allow Server Actions from production domain + Vercel previews
    serverActions: {
      allowedOrigins: ["www.emeraldress.com", "emeraldress.com", "*.vercel.app"],
    },
  },
};

export default nextConfig;
