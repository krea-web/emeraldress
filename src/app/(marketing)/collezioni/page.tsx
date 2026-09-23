import type { Metadata } from "next";
import { CollezioniClient } from "./collezioni-client";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Product } from "@/hooks/useProducts";
import { PUBLIC_PRODUCT_STATUSES, isShowcase } from "@/lib/product-status";

const SITE_URL = "https://www.emeraldress.com";
const SUPABASE_ASSETS = "https://jtmbnmpggzbucmgglisw.supabase.co/storage/v1/object/public/emerald-asset";
const DEFAULT_OG_IMAGE = `${SUPABASE_ASSETS}/logo/og-image.jpg`;

export const metadata: Metadata = {
  title: "Collezione Emerald Touch — Abiti Sostenibili",
  description:
    "Esplora le collezioni Emeraldress: abiti luxury sostenibili in fibra rigenerata ECONYL®, manifattura italiana. Edizione limitata Emerald Touch.",
  alternates: {
    canonical: "/collezioni",
    languages: { "it-IT": "/collezioni", "x-default": "/collezioni" },
  },
  openGraph: {
    title: "Collezione Emerald Touch | Emeraldress",
    description: "Abiti luxury italiani con tessuti sostenibili rigenerati. Scopri Emerald Touch.",
    url: "/collezioni",
    type: "website",
    locale: "it_IT",
    siteName: "Emeraldress",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1216, height: 640, alt: "Collezione Emerald Touch — Emeraldress" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Collezione Emerald Touch | Emeraldress",
    description: "Abiti luxury italiani con tessuti sostenibili rigenerati. Scopri Emerald Touch.",
    images: [DEFAULT_OG_IMAGE],
  },
};

// ISR: rigenera la pagina ogni 60 secondi, in modo che modifiche
// stock/prodotti dall'admin appaiano entro 1 minuto senza redeploy.
// In più ogni navigazione del cliente non rifa la query Supabase: serve
// l'HTML già-generato (super veloce, SEO-ok).
export const revalidate = 60;

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Collezioni", item: `${SITE_URL}/collezioni` },
  ],
};

function buildCollectionSchema(products: Product[]) {
  // I capi in vetrina non hanno una scheda aperta: metterli nell'ItemList
  // significherebbe dare a Google un elenco di URL che rispondono 307.
  const listed = products.filter((p) => !isShowcase(p));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Collezione Emerald Touch",
    description:
      "La selezione Emerald Touch: abiti luxury sostenibili in fibra rigenerata ECONYL®, manifattura italiana, edizione limitata.",
    url: `${SITE_URL}/collezioni`,
    inLanguage: "it-IT",
    isPartOf: { "@type": "WebSite", name: "Emeraldress", url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listed.length,
      itemListElement: listed.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/product/${p.slug ?? p.id}`,
        name: p.name,
      })),
    },
  };
}

/**
 * Server Component: fa il fetch dei prodotti lato server con anon key + RLS
 * pubblica, e passa i dati come `initialProducts` al Client Component.
 *
 * Effetti:
 * - L'HTML iniziale contiene già i prodotti (no loader "Caricamento")
 * - Google/Meta/ChatGPT vedono il contenuto reale
 * - LCP migliorato (immagini prodotto già nell'HTML)
 * - Niente flash del loader al primo paint
 */
async function fetchInitialProducts(): Promise<Product[]> {
  try {
    const supabase = createSupabasePublicClient();
    // Query che riempie l'HTML servito a Google: il filtro DEVE stare qui,
    // non solo lato client. Allow-list esplicita, mai .neq().
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .in("status", PUBLIC_PRODUCT_STATUSES);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[collezioni SSR] fetch products error:", error);
      return [];
    }
    // Normalizzazione identica a useProducts.normalizeProduct
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as Record<string, unknown>[]) ?? []).map((p: any) => {
      const rawImages = Array.isArray(p.images) ? (p.images as unknown[]).flat(Infinity) : [];
      const images = rawImages.filter((u): u is string => typeof u === "string");
      const sizes = Array.isArray(p.sizes) ? p.sizes : p.sizes ? [p.sizes] : [];
      return { ...p, images, sizes } as Product;
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[collezioni SSR] fetch exception:", e);
    return [];
  }
}

export default async function CollezioniPage() {
  const initialProducts = await fetchInitialProducts();
  const collectionSchema = buildCollectionSchema(initialProducts);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <CollezioniClient initialProducts={initialProducts} />
    </>
  );
}
