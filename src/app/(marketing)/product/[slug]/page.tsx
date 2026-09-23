import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Product } from "@/hooks/useProducts";
import { INDEXABLE_PRODUCT_STATUSES, isShowcase } from "@/lib/product-status";
import { ProductDetailClient } from "./product-detail-client";

export const revalidate = 60; // ISR 60s

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SITE_URL = "https://www.emeraldress.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Mojibake" repair: il DB contiene apostrofi mis-encodati (Latin-1 letti come UTF-8).
// Pulisce le stringhe in fase di render finché i dati DB non saranno reimportati.
function fixMojibake(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/�/g, "'") // U+FFFD replacement char
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, "—")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã /g, "à")
    .replace(/Ã²/g, "ò")
    .replace(/Ã¹/g, "ù");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const last = slice.lastIndexOf(" ");
  return (last > max * 0.6 ? slice.slice(0, last) : slice).trim() + "…";
}

/**
 * Legge il prodotto SENZA filtrare lo status: qui serve distinguere i tre
 * casi (inesistente → 404, bozza → 404, vetrina → 307). Il filtro sta
 * a valle, in generateMetadata e in ProductPage.
 */
async function getProduct(slugOrId: string): Promise<Product | null> {
  const supabase = createSupabasePublicClient();
  // postgrest fa fail su .or(`id.eq.<non-uuid>`) perche' id e' uuid:
  // splittiamo la query in due passi e teniamo solo slug se non e' un UUID.
  const looksLikeUuid = UUID_RE.test(slugOrId);
  const query = supabase.from("products").select("*");
  const { data } = looksLikeUuid
    ? await query.or(`slug.eq.${slugOrId},id.eq.${slugOrId}`).maybeSingle()
    : await query.eq("slug", slugOrId).maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data as any;
  const rawImages = Array.isArray(p.images) ? p.images.flat(Infinity) : [];
  return {
    ...p,
    images: rawImages.filter((u: unknown): u is string => typeof u === "string"),
    sizes: Array.isArray(p.sizes) ? p.sizes : p.sizes ? [p.sizes] : [],
  } as Product;
}

export async function generateStaticParams() {
  try {
    const supabase = createSupabasePublicClient();
    // Solo `active`: prerenderizzare una vetrina significherebbe generare a
    // build-time una pagina che a runtime fa comunque redirect.
    const { data } = await supabase
      .from("products")
      .select("slug, id")
      .in("status", INDEXABLE_PRODUCT_STATUSES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) ?? []).map((p) => ({ slug: (p.slug as string) ?? (p.id as string) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    return { title: "Prodotto non trovato", robots: { index: false, follow: false } };
  }
  // Vetrina e bozza non sono pagine da indicizzare: la prima risponde 307,
  // la seconda 404. `follow: false` per non far seguire link che non esistono.
  const noIndex = isShowcase(product) || product.status === "draft";
  const image = product.images[0];
  const cleanName = product.name.trim().replace(/\s+/g, " ");
  const cleanDescriptionFull = fixMojibake(product.description) ||
    `${cleanName} — Abito sostenibile in fibra rigenerata, manifattura italiana Emeraldress.`;
  // Meta description: massimo 155 caratteri (truncamento mobile Google).
  const metaDescription = truncate(cleanDescriptionFull.replace(/\s+/g, " "), 155);
  // Titolo arricchito: nome + tag categoria sostenibile (50–60 char target).
  const titleEnhanced = `${cleanName} — Abito Sostenibile Made in Italy`;

  return {
    title: titleEnhanced,
    description: metaDescription,
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: `/product/${product.slug ?? product.id}`,
      languages: {
        "it-IT": `/product/${product.slug ?? product.id}`,
        "x-default": `/product/${product.slug ?? product.id}`,
      },
    },
    openGraph: {
      title: `${cleanName} | Emeraldress`,
      description: metaDescription,
      url: `/product/${product.slug ?? product.id}`,
      type: "website",
      locale: "it_IT",
      siteName: "Emeraldress",
      ...(image && { images: [{ url: image, width: 1200, height: 1600, alt: cleanName }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: `${cleanName} | Emeraldress`,
      description: metaDescription,
      ...(image && { images: [image] }),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  // Tre rami distinti, nell'ordine:
  if (!product) notFound();                       // non esiste
  if (product.status === "draft") notFound();     // bozza: per il pubblico non esiste
  // Vetrina: 307 e non 404. La vetrina è un interruttore, e l'URL deve
  // restare valido per quando il capo torna in vendita.
  if (isShowcase(product)) redirect("/collezioni");

  const productUrl = `${SITE_URL}/product/${product.slug ?? product.id}`;
  const productImages = product.images.length > 0 ? product.images : [];
  const cleanName = product.name.trim().replace(/\s+/g, " ");
  const cleanDescription = fixMojibake(product.description) ||
    `${cleanName} — Abito sostenibile in fibra rigenerata, manifattura italiana Emeraldress.`;

  // priceValidUntil: 12 mesi da oggi (formato YYYY-MM-DD richiesto da Google).
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cleanName,
    description: cleanDescription,
    image: productImages.length > 0 ? productImages : undefined,
    sku: product.id,
    mpn: product.slug ?? product.id,
    category: "Abbigliamento donna > Abiti",
    brand: { "@type": "Brand", name: "Emeraldress" },
    manufacturer: { "@type": "Organization", name: "Emeraldress", url: SITE_URL },
    countryOfOrigin: { "@type": "Country", name: "IT" },
    offers: {
      "@type": "Offer",
      url: productUrl,
      price: Number(product.price).toFixed(2),
      priceCurrency: "EUR",
      priceValidUntil,
      availability:
        product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Emeraldress", url: SITE_URL },
      // Tariffa indicativa: spedizione effettiva calcolata al checkout in base
      // a destinazione/peso. La normativa Google Merchant richiede un valore;
      // 9.90€ è una stima conservativa per spedizione Italia.
      shippingDetails: [
        {
          "@type": "OfferShippingDetails",
          shippingRate: { "@type": "MonetaryAmount", value: "9.90", currency: "EUR" },
          shippingDestination: { "@type": "DefinedRegion", addressCountry: "IT" },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 5, unitCode: "DAY" },
          },
        },
        {
          "@type": "OfferShippingDetails",
          shippingRate: { "@type": "MonetaryAmount", value: "19.90", currency: "EUR" },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: ["AT", "BE", "DE", "ES", "FR", "NL", "PT"],
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 5, maxValue: 10, unitCode: "DAY" },
          },
        },
      ],
      // Diritto di recesso Italian Consumer Code art. 52 D.Lgs. 206/2005:
      // 14 giorni, reso a carico cliente.
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IT",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      },
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Collezioni", item: `${SITE_URL}/collezioni` },
      { "@type": "ListItem", position: 3, name: cleanName, item: productUrl },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <ProductDetailClient product={product} />
    </>
  );
}
