"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import ImageFallback from "./ImageFallback";
import FullscreenProductViewer from "./FullscreenProductViewer";
import type { Product } from "@/hooks/useProducts";
import { isShowcase } from "@/lib/product-status";

interface ProductCardProps {
  product: Product;
  index?: number;
  /** Lista completa per swipe orizzontale tra prodotti nel viewer. */
  siblings?: Product[];
}

const ProductCard = ({ product, index = 0, siblings }: ProductCardProps) => {
  const href = `/product/${product.slug ?? product.id}`;
  const showcase = isShowcase(product);
  const [fullscreen, setFullscreen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    // Mobile (<lg): apri viewer fullscreen anziche' navigare subito.
    // In vetrina si apre a qualunque larghezza: non c'è nessuna scheda dove
    // andare, e il bottone "Richiedi disponibilità" vive nel visore.
    const mobile =
      typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (showcase || mobile) {
      e.preventDefault();
      setFullscreen(true);
    }
  };

  const list = siblings && siblings.length > 0 ? siblings : [product];
  const initialIndex = Math.max(
    0,
    list.findIndex((p) => p.id === product.id),
  );

  const cardBody = (
    <>
      <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-emerald-50/60 to-white mb-3 shadow-sm transition-shadow duration-300 group-hover:shadow-lg">
        <ImageFallback
          src={product.images?.[0]}
          hoverSrc={product.images?.[1]}
          alt={`${product.name} — Emeraldress abbigliamento sostenibile di lusso`}
          className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="font-serif text-sm md:text-base">{product.name}</h3>
      {/* Stesso slot: il prezzo viene sostituito, non rimosso. */}
      <p className="text-muted-foreground text-sm font-sans mt-1">
        {showcase ? "Su richiesta" : `€${Number(product.price).toFixed(2)}`}
      </p>
    </>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: index * 0.1 }}
        viewport={{ once: true }}
      >
        {showcase ? (
          // Niente <a> in vetrina: un href resterebbe apribile col tasto
          // destro, in nuova scheda, e seguibile dai crawler.
          <div
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFullscreen(true);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Guarda le foto di ${product.name}`}
            className="group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            {cardBody}
          </div>
        ) : (
          <Link href={href} onClick={handleClick} className="group block">
            {cardBody}
          </Link>
        )}
      </motion.div>

      {fullscreen && (
        <FullscreenProductViewer
          products={list}
          initialIndex={initialIndex}
          onDismiss={() => setFullscreen(false)}
        />
      )}
    </>
  );
};

export default ProductCard;
