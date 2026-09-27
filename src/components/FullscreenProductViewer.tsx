"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ShoppingBag, X, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWishlist } from "@/contexts/WishlistContext";
import { AuthDialog } from "./AuthDialog";
import AvailabilityRequestForm from "./AvailabilityRequestForm";
import type { Product } from "@/hooks/useProducts";
import { isShowcase } from "@/lib/product-status";

interface FullscreenProductViewerProps {
  /** Lista di prodotti tra cui scorrere (deve includere quello iniziale). */
  products?: Product[];
  /** Indice del prodotto iniziale dentro `products`. Se products non passato, usa solo `product`. */
  initialIndex?: number;
  /** Fallback: singolo prodotto (retrocompatibilità). */
  product?: Product;
  /** Chiusura silenziosa del viewer. */
  onDismiss: () => void;
  /** @deprecated mantenuto per retrocompatibilità con ProductCard precedente. */
  onClose?: () => void;
  /**
   * Apre subito il form "Richiedi disponibilità" sul capo iniziale.
   * Serve al ritorno dal login: /collezioni?richiesta=<slug>.
   */
  autoOpenRequest?: boolean;
}

const supabase = getSupabaseBrowserClient();

export default function FullscreenProductViewer({
  products,
  initialIndex = 0,
  product: singleProduct,
  onDismiss,
  autoOpenRequest = false,
}: FullscreenProductViewerProps) {
  const router = useRouter();
  const { addItem, removeItem, hasItem } = useWishlist();

  const list: Product[] = useMemo(() => {
    if (products && products.length > 0) return products;
    if (singleProduct) return [singleProduct];
    return [];
  }, [products, singleProduct]);

  const startIndex = useMemo(
    () => Math.max(0, Math.min(initialIndex, list.length - 1)),
    [initialIndex, list.length],
  );

  // Embla: una sola istanza, slide affiancate, loop circolare.
  // - `loop`: scorrere oltre l'ultimo torna al primo (e viceversa)
  // - `containScroll: 'trimSnaps'`: niente "bounce" finale strano
  // - `duration`: animazione fluida (~25 = ~250ms)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex,
    loop: list.length > 1,
    align: "center",
    containScroll: false,
    duration: 25,
  });

  const [index, setIndex] = useState(startIndex);
  const [authOpen, setAuthOpen] = useState(false);
  const [hasUser, setHasUser] = useState<boolean | null>(null);
  // Ritorno dal login con ?richiesta=<slug>: il form si apre gia' montato sul
  // capo su cui la persona aveva premuto. Inizializzatore invece di un
  // effect: e' un valore noto al montaggio, non qualcosa da sincronizzare.
  const [requestOpen, setRequestOpen] = useState(autoOpenRequest);

  const product = list[index];
  // Vetrina: il carosello, il loop e lo swipe restano identici (le foto
  // devono scorrere), ma spariscono prezzo, accesso alla scheda e azioni.
  const showcase = isShowcase(product);
  const liked = product ? hasItem(product.id) : false;
  const productHref = product ? `/product/${product.slug ?? product.id}` : "/";
  const cover = product?.images?.[0] ?? "";

  // Sync emblaApi → React state (per indicatore, info bottom, etc.)
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // Elemento che ha aperto il visore: alla chiusura il focus torna lì,
  // altrimenti su desktop si finisce a navigare da capo con il Tab.
  const openerRef = useRef<HTMLElement | null>(null);

  // Lock body scroll mentre il viewer è aperto + auth probe
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    supabase.auth.getSession().then(({ data }) => setHasUser(!!data.session?.user));
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      openerRef.current?.focus?.();
    };
  }, []);

  const goPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const goNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const openDetail = useCallback(() => {
    // In vetrina la scheda non si apre: no-op.
    if (isShowcase(list[index])) return;
    router.push(productHref);
  }, [router, productHref, list, index]);

  // Tastiera: da desktop il visore è una destinazione a tutti gli effetti,
  // e senza queste scorciatoie si resta intrappolati col mouse.
  // Quando il form è aperto comanda lui: ha il suo Esc, e le frecce devono
  // restare disponibili per muoversi dentro i campi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (requestOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestOpen, onDismiss, goPrev, goNext]);

  /**
   * Per chiedere bisogna essere registrati, altrimenti arrivano richieste a
   * caso. Il ritorno riapre il visore su QUESTO capo con il form già aperto.
   */
  const requestAvailability = () => {
    if (!product) return;
    if (hasUser === false) {
      const back = `/collezioni?richiesta=${encodeURIComponent(product.slug ?? product.id)}`;
      router.push(`/login?redirectTo=${encodeURIComponent(back)}`);
      return;
    }
    setRequestOpen(true);
  };

  const toggleLike = () => {
    if (!product) return;
    if (liked) {
      removeItem(product.id);
      return;
    }
    if (hasUser === false) {
      setAuthOpen(true);
      return;
    }
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: cover,
    });
  };

  if (!product) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="fs-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100] bg-black"
        role="dialog"
        aria-modal="true"
        aria-label={`Anteprima ${product.name}`}
      >
        {/* Carousel: tutte le slide nel DOM contemporaneamente.
            Niente unmount/remount → niente flash nero, immagini caricate in
            parallelo dal browser. */}
        <div className="absolute inset-0 overflow-hidden" ref={emblaRef}>
          <div className="flex h-full">
            {list.map((p, i) => {
              const isAdjacent = Math.abs(i - index) <= 1 || (list.length > 2 && (Math.abs(i - index) === list.length - 1));
              // Per-slide, non sul prodotto corrente: durante il drag
              // l’indice puo’ essere ancora quello precedente.
              const slideShowcase = isShowcase(p);
              return (
                <div
                  key={p.id}
                  className="relative min-w-0 shrink-0 grow-0 basis-full h-full"
                  {...(slideShowcase
                    ? {}
                    : {
                        onClick: openDetail,
                        role: "button",
                        "aria-label": `Apri scheda ${p.name}`,
                      })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.images?.[0] ?? ""}
                    alt={p.name}
                    // Eager su prodotto corrente e vicini; lazy sugli altri
                    loading={isAdjacent ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Top gradient + close */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <button
          onClick={onDismiss}
          aria-label="Chiudi anteprima"
          className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md text-white flex items-center justify-center active:scale-95 transition"
        >
          <X size={18} />
        </button>

        {/* Indicatore pagina */}
        {list.length > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-[10px] tracking-[0.25em] font-medium">
            {index + 1} / {list.length}
          </div>
        )}

        {/* Frecce laterali (tap fallback per chi non swipa) */}
        {list.length > 1 && (
          <>
            <button
              onClick={goPrev}
              aria-label="Capo precedente"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md text-white/80 flex items-center justify-center active:scale-90 transition md:left-4"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={goNext}
              aria-label="Capo successivo"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md text-white/80 flex items-center justify-center active:scale-90 transition md:right-4"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Bottom info + actions */}
        <div className="absolute inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)] bg-gradient-to-t from-black/85 via-black/50 to-transparent pt-12">
          <div className="px-5 pb-5 max-w-3xl mx-auto w-full">
            {!showcase && (
              <button
                onClick={openDetail}
                className="flex items-center gap-1.5 text-white/70 text-[10px] tracking-[0.25em] uppercase mb-3 active:text-white"
              >
                <ChevronUp size={14} />
                Apri scheda · tocca l&apos;immagine
              </button>
            )}

            <div className="flex items-end justify-between gap-4">
              {showcase ? (
                // Solo il nome: niente prezzo e niente semantica di bottone,
                // non c’è nessuna scheda da aprire.
                <div className="flex-1 text-left min-w-0">
                  <h2
                    className="text-white text-xl truncate"
                    style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                  >
                    {product.name}
                  </h2>
                  <p className="text-white/60 text-sm mt-1">Su richiesta</p>
                </div>
              ) : (
                <button onClick={openDetail} className="flex-1 text-left min-w-0">
                  <h2
                    className="text-white text-xl truncate"
                    style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                  >
                    {product.name}
                  </h2>
                  <p className="text-white/80 text-sm mt-1">€ {Number(product.price).toFixed(2)}</p>
                </button>
              )}

              {/* In vetrina spariscono entrambe le azioni di acquisto. Il
                  cuore compreso: la wishlist salva anche il prezzo, e quel
                  prezzo ricomparirebbe in /profilo. Al loro posto, l’unica
                  azione possibile su un capo in vetrina. */}
              {showcase && (
                <button
                  onClick={requestAvailability}
                  disabled={hasUser === null}
                  className="shrink-0 h-12 px-6 rounded-full bg-white text-emerald-950 text-[11px] tracking-[0.2em] uppercase font-medium whitespace-nowrap shadow-lg active:scale-95 disabled:opacity-60 transition-all"
                >
                  Richiedi disponibilità
                </button>
              )}

              {!showcase && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={toggleLike}
                    aria-label={liked ? "Rimuovi dalla wishlist" : "Aggiungi alla wishlist"}
                    className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 ${
                      liked
                        ? "bg-rose-500/95 text-white"
                        : "bg-white/15 text-white border border-white/25"
                    }`}
                  >
                    <Heart size={20} fill={liked ? "currentColor" : "none"} strokeWidth={liked ? 0 : 2} />
                  </button>
                  <button
                    onClick={openDetail}
                    aria-label="Vai alla scheda prodotto"
                    className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-emerald-950 active:scale-90 transition-all shadow-lg"
                  >
                    <ShoppingBag size={20} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {requestOpen && product && (
        <AvailabilityRequestForm
          product={product}
          onClose={() => setRequestOpen(false)}
        />
      )}

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        returnTo={productHref}
        title="Salva nel tuo Circle"
        subtitle="Accedi per salvare questo capo nella tua wishlist e ritrovarlo nell'area personale."
        onAuthenticated={() => {
          addItem({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            image: cover,
          });
          setHasUser(true);
        }}
      />
    </AnimatePresence>
  );
}
