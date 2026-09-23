/**
 * Costruisce l'URL del Loader Script di Sentry a partire dal DSN, validandolo.
 *
 * Due difetti che questo modulo chiude, e che insieme spiegano perché il
 * progetto Sentry ha ricevuto ZERO eventi senza che nessuno se ne accorgesse:
 *
 * 1. REGIONE. Le chiavi di un'organizzazione europea si servono SOLO da
 *    `js-de.sentry-cdn.com`. Il codice precedente scriveva a mano
 *    `js.sentry-cdn.com` (regione Stati Uniti), dove la chiave non esiste.
 *    Chiedere una chiave alla CDN della regione sbagliata NON dà 404: Sentry
 *    risponde 200 con uno stub di ~567 byte in cui ogni funzione dell'SDK è un
 *    `console.warn` vuoto. Lo script si carica, la pagina non rompe, e non
 *    parte nessun evento. Per questo l'host viene derivato dal DSN e non
 *    scritto a mano: se la chiave cambia regione, l'URL la segue da solo.
 *    (La CSP no: quella va aggiornata a mano in next.config.ts.)
 *
 * 2. DSN MALFORMATO. Il vecchio `dsn.split("//")[1]?.split("@")[0]` su un DSN
 *    malformato produceva la stringa "undefined" dentro l'URL, e caricava uno
 *    script che faceva 404 in silenzio. Qui un DSN che non è un DSN dà `null`,
 *    cioè nessuno <Script> in pagina, più un warning nei log di build.
 *
 * Nota: il bundle completo dell'SDK viene poi scaricato dal loader da
 * `browser.sentry-cdn.com` — senza suffisso di regione, anche per le chiavi UE.
 */

/** Forma di un DSN: `https://<publicKey>@<host>/<projectId>`. */
export function sentryLoaderUrl(dsn: string | undefined | null): string | null {
  if (!dsn) return null;

  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    console.warn("[sentry] NEXT_PUBLIC_SENTRY_DSN non è un URL valido: loader non installato.");
    return null;
  }

  const publicKey = parsed.username;
  const projectId = parsed.pathname.replace(/^\/+/, "");

  if (
    parsed.protocol !== "https:" ||
    !/^[a-zA-Z0-9]{16,64}$/.test(publicKey) ||
    !/^\d+$/.test(projectId)
  ) {
    console.warn(
      "[sentry] NEXT_PUBLIC_SENTRY_DSN malformato (atteso https://<publicKey>@<host>/<projectId>): loader non installato.",
    );
    return null;
  }

  // Host del DSN: `o<org>.ingest.<regione>.sentry.io`. Gli host storici senza
  // segmento di regione, e quelli `.us.`, sono serviti da `js.sentry-cdn.com`.
  const region = parsed.hostname.match(/\.ingest\.([a-z]{2})\.sentry\.io$/i)?.[1]?.toLowerCase();
  const cdnHost = region && region !== "us" ? `js-${region}.sentry-cdn.com` : "js.sentry-cdn.com";

  return `https://${cdnHost}/${publicKey}.min.js`;
}
