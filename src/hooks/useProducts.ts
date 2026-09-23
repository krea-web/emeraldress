"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PUBLIC_PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";

// Ri-esportati per comodità dei Client Component che già importano da qui.
// La definizione vera sta in @/lib/product-status (serve anche lato server).
export { isShowcase, PUBLIC_PRODUCT_STATUSES } from "@/lib/product-status";
export type { ProductStatus } from "@/lib/product-status";

function normalizeProduct(p: Record<string, unknown>) {
  const rawImages = Array.isArray(p.images) ? (p.images as unknown[]).flat(Infinity) : [];
  const images = rawImages.filter((u): u is string => typeof u === "string");
  const sizes = Array.isArray(p.sizes) ? p.sizes : p.sizes ? [p.sizes] : [];
  return { ...p, images, sizes };
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  images: string[];
  sizes: string[] | null;
  fabric_details: string | null;
  shipping_info: string | null;
  stock: number;
  /** Stock per ogni taglia, es. `{"XS/S": 4, "S/M": 3, "M/L": 3}`. La colonna `stock` totale è auto-sincronizzata da trigger DB. */
  stock_by_size: Record<string, number>;
  created_at: string;
  slug?: string | null;
  stripe_payment_link?: string | null;
  /** `active` | `showcase` | `draft`. Serve alle card per sapere se è in vetrina. */
  status: ProductStatus;
}

// Timeout di sicurezza: se Supabase non risponde entro 8s, throw error.
// Senza questo, isLoading resta true forever su rete lenta/RLS error silenzioso.
async function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout: il server impiega troppo tempo a rispondere")), ms),
    ),
  ]);
}

export const useProducts = (
  category?: string,
  options?: { initialData?: Product[] },
) =>
  useQuery({
    queryKey: ["products", category],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      // Allow-list esplicita: un capo in bozza non deve uscire da qui.
      // Mai .neq("status","draft"): una riga con status inatteso passerebbe.
      let query = supabase
        .from("products")
        .select("*")
        .in("status", PUBLIC_PRODUCT_STATUSES);
      if (category) query = query.eq("category", category);
      const { data, error } = await fetchWithTimeout(Promise.resolve(query), 8000);
      if (error) throw error;
      return ((data as Record<string, unknown>[]) || []).map(normalizeProduct) as unknown as Product[];
    },
    initialData: options?.initialData,
    // Se passiamo initialData (da SSR), evitiamo refetch al mount: i dati
    // sono freschi appena renderizzati. Refetch automatico dopo 1 min.
    staleTime: options?.initialData ? 60_000 : 0,
    // Limit retry per non ciclare infinito su errori persistenti
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

