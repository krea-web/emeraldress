/**
 * Analytics layer (GA4 + Consent Mode v2).
 * Tutto sandbox client-side: lazy-load di gtag, default deny finché il banner cookie accetta.
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
    __ga4Loaded?: boolean;
    posthog?: {
      opt_in_capturing?: () => void;
      opt_out_capturing?: () => void;
    };
  }
}

// Stessa chiave usata da CookieBanner: la scelta dell'utente vive li'.
const CONSENT_STORAGE_KEY = "emeraldress_cookie_consent_v1";

const GA4_ID = (process.env.NEXT_PUBLIC_GA4_ID as string | undefined)?.trim();

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (!GA4_ID) return;
  if (window.__ga4Loaded) return;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);

  window.gtag?.("config", GA4_ID, {
    anonymize_ip: true,
    send_page_view: true,
  });

  window.__ga4Loaded = true;
}

export function grantAnalyticsConsent() {
  window.gtag?.("consent", "update", { analytics_storage: "granted" });
  initAnalytics();
  // PostHog parte opt-out (vedi layout.tsx): senza questa riga il consenso
  // varrebbe solo per GA4.
  window.posthog?.opt_in_capturing?.();
}

export function denyAnalyticsConsent() {
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  // Il pulsante "Rifiuta" deve fermare TUTTI i tracciatori, non solo GA4.
  window.posthog?.opt_out_capturing?.();
}

/**
 * Riapplica la scelta gia' fatta, a ogni caricamento di pagina.
 *
 * Serve perche' grant/deny venivano chiamate solo al click sul banner: chi
 * aveva gia' accettato in una visita precedente non vedeva piu' il banner e
 * quindi non riattivava niente. Con PostHog che parte opt-out, senza questo
 * il consenso dato ieri non varrebbe oggi.
 */
export function applyStoredAnalyticsConsent() {
  if (typeof window === "undefined") return;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    // Storage bloccato (navigazione privata, impostazioni): nel dubbio non
    // si traccia. Il default resta opt-out.
    return;
  }
  if (stored === "accepted") grantAnalyticsConsent();
  else if (stored === "rejected") denyAnalyticsConsent();
}

export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}) {
  try {
    window.gtag?.("event", name, params);
  } catch {
    /* ignore */
  }
}

export function trackPageView(path: string) {
  if (!GA4_ID) return;
  window.gtag?.("event", "page_view", { page_path: path });
}
