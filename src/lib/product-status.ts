/**
 * Stato di pubblicazione di un capo — unica fonte di verità.
 *
 * Vive qui e non in `useProducts.ts` perché serve identico ai Server Component
 * (collezioni/page.tsx, product/[slug]/page.tsx, sitemap.ts) e ai Client
 * Component: un modulo `"use client"` non è importabile lato server.
 *
 * I tre stati sono vincolati a DB dal CHECK `products_status_check`:
 *  - `active`   → visibile e acquistabile
 *  - `showcase` → vetrina: le foto si vedono e scorrono, ma la scheda non si
 *                 apre e non si mostrano prezzo né disponibilità. Non
 *                 acquistabile: /api/checkout accetta solo `active`.
 *  - `draft`    → invisibile al pubblico
 */
export type ProductStatus = "active" | "showcase" | "draft";

/**
 * Gli status che il pubblico può vedere. Allow-list esplicita, mai `.neq()`:
 * con una negazione una riga con status inatteso (o NULL) passerebbe il filtro.
 */
export const PUBLIC_PRODUCT_STATUSES: ProductStatus[] = ["active", "showcase"];

/** Gli status indicizzabili: solo i capi realmente in vendita. */
export const INDEXABLE_PRODUCT_STATUSES: ProductStatus[] = ["active"];

/**
 * Unico punto in cui si decide se un capo è "in vetrina". Da importare ovunque
 * invece di confrontare la stringa a mano: le card pubbliche sono tre, distinte
 * e facili da dimenticare (ProductCard, CollectionCard, LatestCollectionShowcase).
 */
export function isShowcase(product: { status?: string | null } | null | undefined): boolean {
  return product?.status === "showcase";
}
