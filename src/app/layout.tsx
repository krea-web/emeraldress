import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Playfair_Display, Alice } from "next/font/google";
import { Providers } from "./providers";
import { sentryLoaderUrl } from "@/lib/sentry-loader";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const alice = Alice({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400"],
});

const SITE_URL = "https://www.emeraldress.com";
const SUPABASE_ASSETS = "https://jtmbnmpggzbucmgglisw.supabase.co/storage/v1/object/public/emerald-asset";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EMERALDRESS — Lusso Consapevole e Manifattura Italiana",
    template: "%s | EMERALDRESS",
  },
  description:
    "Emeraldress: moda sostenibile e lusso consapevole dal cuore della Costa Smeralda. Manifattura italiana con materiali rigenerati ECONYL®.",
  keywords: [
    "moda sostenibile",
    "abbigliamento lusso",
    "fibra riciclata",
    "ECONYL",
    "manifattura italiana",
    "abiti da sera",
    "pret-a-porter",
    "Costa Smeralda",
    "luxury fashion",
    "moda etica",
  ],
  authors: [{ name: "EMERALDRESS" }],
  alternates: {
    canonical: "/",
    languages: {
      it: SITE_URL,
      "x-default": SITE_URL,
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: SITE_URL,
    siteName: "Emeraldress",
    title: "Emeraldress | Moda Luxury Sostenibile",
    description: "Abiti luxury italiani con tessuti sostenibili ECONYL® riciclati.",
    images: [
      {
        url: `${SUPABASE_ASSETS}/logo/og-image.jpg`,
        width: 1216,
        height: 640,
        alt: "Emeraldress — Sustainable Mediterranean Luxury, Costa Smeralda",
      },
      {
        url: `${SUPABASE_ASSETS}/logo/og-image-square.jpg`,
        width: 1088,
        height: 1088,
        alt: "Emeraldress — Sustainable Mediterranean Luxury",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@emeraldress",
    creator: "@emeraldress",
    title: "Emeraldress | Moda Luxury Sostenibile",
    description: "Abiti luxury italiani con tessuti sostenibili ECONYL® riciclati.",
    images: [`${SUPABASE_ASSETS}/logo/og-image.jpg`],
  },
  icons: {
    icon: [
      { url: `${SUPABASE_ASSETS}/logo/favicon.ico`, sizes: "any" },
      { url: `${SUPABASE_ASSETS}/faviconemeraldress.svg`, type: "image/svg+xml" },
      { url: `${SUPABASE_ASSETS}/logo/favicon-32x32.png`, sizes: "32x32", type: "image/png" },
      { url: `${SUPABASE_ASSETS}/logo/favicon-16x16.png`, sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: `${SUPABASE_ASSETS}/logo/apple-touch-icon.png`, sizes: "180x180" }],
  },
  manifest: "/manifest.json",
  other: {
    "geo.region": "IT",
    "geo.placename": "Italia",
    "format-detection": "telephone=no",
    "apple-mobile-web-app-title": "Emeraldress",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#e4ffec",
  width: "device-width",
  initialScale: 1,
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "EMERALDRESS",
  url: SITE_URL,
  logo: `${SUPABASE_ASSETS}/emeraldress-icon-ed.svg`,
  sameAs: ["https://www.instagram.com/emeraldress/"],
  address: {
    "@type": "PostalAddress",
    addressCountry: "IT",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Emeraldress",
  url: SITE_URL,
  inLanguage: "it-IT",
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/collezioni?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

// PostHog EU (round 10 Kreare): attivo solo con le env presenti; niente
// session recording (GDPR); i pageview delle navigazioni SPA arrivano dai
// defaults 2025 (history change). Loader ufficiale inline, zero dipendenze.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
// Sentry (round 10): loader ufficiale, solo con la env. Errori = sicurezza.
// L'host della CDN è derivato dalla regione del DSN, non scritto a mano: la
// chiave è europea e si serve da js-de.sentry-cdn.com. Chiederla a
// js.sentry-cdn.com dava 200 con uno stub inerte — zero eventi, zero errori.
// Il dominio va tenuto allineato alla script-src in next.config.ts.
const sentryLoader = sentryLoaderUrl(process.env.NEXT_PUBLIC_SENTRY_DSN);
const posthogSnippet =
  POSTHOG_KEY && POSTHOG_HOST
    ? `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${POSTHOG_KEY}',{api_host:'${POSTHOG_HOST}',defaults:'2025-05-24',person_profiles:'identified_only',disable_session_recording:true});`
    : null;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it-IT" className={`${playfair.variable} ${alice.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        {/* next/script con id: deduplica (il raw <script> nel head viene
            renderizzato due volte dall'App Router; su marghine la doppia init
            lasciava PostHog senza request queue) */}
        {sentryLoader && <Script id="sentry-loader" src={sentryLoader} crossOrigin="anonymous" strategy="afterInteractive" />}
        {posthogSnippet && <Script id="posthog-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: posthogSnippet }} />}
      </body>
    </html>
  );
}
