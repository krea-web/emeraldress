/**
 * Regole di spedizione — unica fonte di verità per il server (Stripe) e per la UI.
 *
 * Prima di questo modulo la soglia viveva solo in CartDrawer.tsx, cioè nella
 * barra di progresso: lato server non era applicata da nessuna parte e a Stripe
 * venivano passate DUE shipping_options insieme (0 € e 9,90 €), con quella da
 * 0 € preselezionata perché prima in lista. Chiunque spediva gratis.
 *
 * Tre regole, valide ovunque queste costanti vengano lette:
 *  1. Una sola opzione: la decide il server sul subtotale reale, non il cliente.
 *  2. Soglia = 0 significa "nessuna soglia", NON "sempre gratis".
 *  3. Costo = 0 significa nessuna opzione inviata a Stripe: un rate a 0 €
 *     tornerebbe a comparire come voce selezionabile nel checkout.
 */

/** Soglia di spedizione gratuita in euro. 0 = nessuna soglia (mai gratis). */
export const FREE_SHIPPING_THRESHOLD_EUR = 200;

/** Costo della spedizione standard in euro. 0 = nessuna opzione di spedizione. */
export const STANDARD_SHIPPING_EUR = 9.9;

export const FREE_SHIPPING_THRESHOLD_CENTS = Math.round(FREE_SHIPPING_THRESHOLD_EUR * 100);
export const STANDARD_SHIPPING_CENTS = Math.round(STANDARD_SHIPPING_EUR * 100);

/**
 * Costo di spedizione (in centesimi) per un subtotale in centesimi.
 * Ritorna 0 quando l'ordine supera la soglia: il chiamante deve tradurre
 * "0" in "nessuna shipping_option", non in "un rate da 0 €".
 */
export function shippingCostCents(subtotalCents: number): number {
  const qualifiesForFree =
    FREE_SHIPPING_THRESHOLD_CENTS > 0 && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
  return qualifiesForFree ? 0 : STANDARD_SHIPPING_CENTS;
}
