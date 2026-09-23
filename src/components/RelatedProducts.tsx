"use client";

import Link from "next/link";
import { useProducts } from "@/hooks/useProducts";
import { isShowcase } from "@/lib/product-status";
import ImageFallback from "./ImageFallback";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const RelatedProducts = ({
  currentProductId,
  category,
}: {
  currentProductId: string;
  category: string;
}) => {
  const { data: products } = useProducts(category || undefined);
  // I capi in vetrina sono esclusi del tutto: questo è cross-selling, e un
  // capo non vendibile qui non ha funzione (né una scheda da aprire).
  const others =
    products?.filter((p) => p.id !== currentProductId && !isShowcase(p)) ?? [];

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    slidesToScroll: 1,
    containScroll: "trimSnaps",
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (others.length === 0) return null;

  return (
    <section className="mt-16 md:mt-24 pb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-serif text-lg md:text-xl tracking-wide">Potrebbe piacerti</h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canPrev}
            className={cn(
              "w-8 h-8 border border-border flex items-center justify-center transition-colors",
              canPrev ? "hover:bg-muted text-foreground" : "text-muted-foreground/30 cursor-default"
            )}
            aria-label="Precedente"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canNext}
            className={cn(
              "w-8 h-8 border border-border flex items-center justify-center transition-colors",
              canNext ? "hover:bg-muted text-foreground" : "text-muted-foreground/30 cursor-default"
            )}
            aria-label="Successivo"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div ref={emblaRef} className="overflow-hidden -mx-2">
        <div className="flex">
          {others.map((product) => (
            <div
              key={product.id}
              className="min-w-0 shrink-0 grow-0 basis-1/2 sm:basis-1/3 lg:basis-1/4 px-2"
            >
              <Link href={`/product/${product.slug ?? product.id}`} className="group block">
                <div className="aspect-[3/4] overflow-hidden bg-muted mb-2">
                  <ImageFallback
                    src={product.images?.[0]}
                    hoverSrc={product.images?.[1]}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <p className="font-serif text-xs md:text-sm truncate">{product.name}</p>
                <p className="text-muted-foreground text-xs font-sans mt-0.5">
                  €{Number(product.price).toFixed(2)}
                </p>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RelatedProducts;
