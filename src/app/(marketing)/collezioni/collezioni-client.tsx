"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useProducts, type Product } from "@/hooks/useProducts";
import { isShowcase } from "@/lib/product-status";
import GemLoader from "@/components/GemLoader";
import FullscreenProductViewer from "@/components/FullscreenProductViewer";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import RelatedLinks from "@/components/RelatedLinks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const logoET = "https://jtmbnmpggzbucmgglisw.supabase.co/storage/v1/object/public/emerald-asset/emeraldress-logo-touch-collection.svg";

const CollectionCard = ({
  product,
  index,
  onOpenViewer,
}: {
  product: Product;
  index: number;
  onOpenViewer: (id: string) => void;
}) => {
  const href = `/product/${product.slug ?? product.id}`;
  const showcase = isShowcase(product);

  // Total stock = somma di tutte le taglie (per badge urgency)
  const totalStock = useMemo(() => {
    const sbs = product.stock_by_size ?? {};
    return Object.values(sbs).reduce<number>(
      (acc, v) => acc + (typeof v === "number" ? Math.max(0, v) : 0),
      0,
    );
  }, [product.stock_by_size]);

  // In vetrina non si comunica disponibilità: niente badge "Esaurito"/"Ultimo
  // pezzo" e niente grayscale, che direbbe la stessa cosa al colpo d'occhio.
  const soldOut = !showcase && totalStock === 0;
  const lowStock = !showcase && totalStock > 0 && totalStock <= 3;

  const handleClick = (e: React.MouseEvent) => {
    // Mobile/tablet (<lg): apri viewer fullscreen con swipe siblings.
    // Vale anche in vetrina: il requisito è che le foto scorrano.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      e.preventDefault();
      onOpenViewer(product.id);
    }
  };

  const cardBody = (
    <>
      <div className="relative w-full aspect-[3/4.5] overflow-hidden bg-[#fdfdfd]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images?.[0]}
          alt={product.name}
          className={`w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 ${
            soldOut ? "grayscale opacity-70" : ""
          }`}
        />

        {product.images[1] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[1]}
            alt={product.name}
            className={`absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-1000 ${
              soldOut ? "grayscale" : ""
            }`}
          />
        )}

        {/* Badge urgency in alto a sinistra */}
        {soldOut && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-stone-900/90 backdrop-blur-sm text-white text-[9px] tracking-[0.2em] uppercase font-medium">
            Esaurito
          </div>
        )}
        {!soldOut && lowStock && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-rose-600/95 backdrop-blur-sm text-white text-[9px] tracking-[0.2em] uppercase font-medium shadow-sm">
            {totalStock === 1 ? "Ultimo pezzo" : `Solo ${totalStock} pezzi`}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center gap-1.5 px-2">
        <h3 className="font-serif text-sm tracking-wide text-neutral-800 group-hover:text-emerald-900 transition-colors">
          {product.name}
        </h3>
        {/* Stesso slot nei due casi: il prezzo viene sostituito, non tolto,
            così la griglia non collassa di mezza riga. */}
        <p className="font-sans text-[11px] tracking-[0.1em] text-neutral-500 font-light">
          {showcase
            ? "Su richiesta"
            : new Intl.NumberFormat("it-IT", {
                style: "currency",
                currency: "EUR",
              }).format(product.price)}
        </p>
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.05 }}
      className="group relative"
    >
      {showcase ? (
        // Niente <a>: non basta bloccare il click, un href resta apribile col
        // tasto destro, in una nuova scheda, ed è seguibile dai crawler.
        // Su mobile il tap apre comunque il viewer a tutto schermo.
        <div
          onClick={handleClick}
          className="flex flex-col gap-4 cursor-pointer lg:cursor-default"
        >
          {cardBody}
        </div>
      ) : (
        <Link href={href} onClick={handleClick} className="flex flex-col gap-4 cursor-pointer">
          {cardBody}
        </Link>
      )}
    </motion.div>
  );
};

export function CollezioniClient({ initialProducts }: { initialProducts?: Product[] }) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "none">("none");
  const [viewerProductId, setViewerProductId] = useState<string | null>(null);

  const { data: allProducts, isLoading, isError, refetch } = useProducts(undefined, { initialData: initialProducts });
  const products = useMemo(
    () =>
      (allProducts || []).filter((p) => {
        const cat = (p.category || "").toLowerCase().replace(/\s|-/g, "");
        return cat === "emeraldtouch";
      }),
    [allProducts],
  );

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    const items = [...products];
    if (sortOrder === "asc") return items.sort((a, b) => a.price - b.price);
    if (sortOrder === "desc") return items.sort((a, b) => b.price - a.price);
    return items;
  }, [products, sortOrder]);

  const viewerIndex = viewerProductId
    ? sortedProducts.findIndex((p) => p.id === viewerProductId)
    : -1;

  return (
    <main className="pt-28 pb-20 min-h-screen bg-[#e4ffec]/20 transition-colors duration-500">
      <div className="text-center mb-16 container mx-auto px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <span className="text-[10px] font-bold tracking-[0.4em] text-emerald-700/70 uppercase font-sans">
            Atelier 2026
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoET} alt="Emerald Touch" className="h-10 md:h-14 object-contain mx-auto" />
          <h1 className="sr-only">Collezione Emerald Touch — Emeraldress</h1>
          <div className="w-12 h-[1px] bg-emerald-200 mx-auto mt-6"></div>
        </motion.div>
      </div>

      <div className="sticky top-[102px] z-30 bg-white/70 backdrop-blur-xl border-y border-emerald-100/50 mb-12 py-4">
        <div className="container mx-auto px-6 lg:px-12 flex justify-between items-center">
          <span className="text-[9px] text-neutral-400 tracking-[0.2em] uppercase font-sans">
            {sortedProducts.length} Pezzi Unici
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-medium font-sans text-neutral-600 hover:text-emerald-700 transition-colors">
                Ordina <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none border-emerald-50 w-56 bg-white/95 p-2">
              <DropdownMenuItem
                onClick={() => setSortOrder("none")}
                className="text-[10px] uppercase tracking-widest py-3 cursor-pointer font-sans"
              >
                Default
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortOrder("asc")}
                className="text-[10px] uppercase tracking-widest py-3 cursor-pointer font-sans"
              >
                Prezzo: Crescente
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortOrder("desc")}
                className="text-[10px] uppercase tracking-widest py-3 cursor-pointer font-sans"
              >
                Prezzo: Decrescente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="container mx-auto px-6 lg:px-12">
        {isError ? (
          <div className="text-center py-32 max-w-md mx-auto">
            <p className="font-serif text-xl text-neutral-700 mb-3">
              Impossibile caricare la collezione
            </p>
            <p className="text-sm text-neutral-500 mb-6">
              Si è verificato un problema temporaneo. Riprova tra qualche secondo.
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[11px] tracking-[0.25em] uppercase font-medium border border-emerald-900 text-emerald-950 hover:bg-emerald-900 hover:text-emerald-50 transition-all"
            >
              Riprova
            </button>
          </div>
        ) : isLoading && sortedProducts.length === 0 ? (
          <div className="flex justify-center py-32">
            <GemLoader />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={sortOrder}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-y-20"
            >
              {sortedProducts.map((product, i) => (
                <CollectionCard
                  key={product.id}
                  product={product}
                  index={i}
                  onOpenViewer={setViewerProductId}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {!isLoading && sortedProducts.length === 0 && (
          <div className="text-center py-40">
            <p className="font-serif text-2xl text-neutral-300 italic">
              La selezione è attualmente in preparazione.
            </p>
          </div>
        )}
      </div>

      <RelatedLinks
        title="Continua il viaggio"
        intro="Dietro ogni capo c'è una filiera, una filosofia e uno strumento per misurarne l'impatto. Esplora il resto del mondo Emeraldress."
        links={[
          { to: "/", label: "Home", desc: "Il manifesto e l'esperienza visiva del brand.", eyebrow: "Inizio" },
          { to: "/sostenibilita", label: "Sostenibilità", desc: "La fibra rigenerata e il processo di trasformazione.", eyebrow: "Materia" },
          { to: "/emeraldscanner", label: "Emerald Scanner", desc: "Analizza un capo e scopri il suo impatto reale.", eyebrow: "Strumento" },
          { to: "/chi-siamo", label: "Chi Siamo", desc: "Vision, mission e filiera 100% Made in Italy.", eyebrow: "Manifesto" },
        ]}
      />

      {viewerIndex >= 0 && (
        <FullscreenProductViewer
          products={sortedProducts}
          initialIndex={viewerIndex}
          onDismiss={() => setViewerProductId(null)}
        />
      )}
    </main>
  );
}
