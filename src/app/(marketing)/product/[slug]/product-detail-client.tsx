"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Ruler,
  ShoppingBag,
  Heart,
  Truck,
  RotateCcw,
  ShieldCheck,
  Leaf,
  Sparkles,
  Star,
  Check,
  Share2,
  Lock,
  Hammer,
  X,
} from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { toast } from "sonner";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import ImageFallback from "@/components/ImageFallback";
import RelatedProducts from "@/components/RelatedProducts";
import ProductReviews from "@/components/ProductReviews";
import RelatedLinks from "@/components/RelatedLinks";
import RecentlyViewed from "@/components/RecentlyViewed";
import { AuthDialog } from "@/components/AuthDialog";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { Product } from "@/hooks/useProducts";

const supabase = getSupabaseBrowserClient();

// ── Size guide modal ──────────────────────────────────────────────────────
const SIZE_GUIDE_ED = [
  { size: "XS/S", it: "36 – 38", bacino: "80 – 90 cm", fit: "Aderente" },
  { size: "S/M", it: "38 – 40", bacino: "90 – 100 cm", fit: "Aderente" },
  { size: "M/L", it: "42 – 44", bacino: "100 – 110 cm", fit: "Comfort fit aderente" },
];
const SIZE_GUIDE_MEASURES = [
  { size: "XS/S", seno: "78 – 86 cm", vita: "58 – 66 cm", fianchi: "80 – 90 cm" },
  { size: "S/M", seno: "86 – 94 cm", vita: "66 – 74 cm", fianchi: "90 – 100 cm" },
  { size: "M/L", seno: "94 – 102 cm", vita: "74 – 82 cm", fianchi: "100 – 110 cm" },
];

const SizeGuideModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] bg-emerald-950/45 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-3 sm:inset-x-4 top-1/2 -translate-y-1/2 z-[61] max-w-2xl mx-auto bg-[#faf6ef] rounded-2xl shadow-2xl border border-emerald-200/60 max-h-[90vh] overflow-hidden flex flex-col"
        >
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/70 hover:bg-white text-emerald-800/70 hover:text-emerald-950 transition-colors backdrop-blur-sm"
          >
            <X size={16} />
          </button>

          <div className="overflow-y-auto px-5 sm:px-10 py-8 sm:py-10">
            {/* Brand header */}
            <div className="text-center mb-6">
              <h2
                className="text-2xl sm:text-3xl tracking-[0.18em] text-emerald-950"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                EMERALDRESS
              </h2>
              <div className="flex items-center justify-center gap-2 my-2">
                <span className="h-px w-8 bg-emerald-700/30" />
                <span
                  className="text-[11px] tracking-[0.3em] text-emerald-700/80"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
                >
                  ED
                </span>
                <span className="h-px w-8 bg-emerald-700/30" />
              </div>
              <h3
                className="text-xl sm:text-2xl tracking-[0.12em] text-emerald-950"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                GUIDA ALLE TAGLIE
              </h3>
              <p className="mt-2 text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-emerald-700/65">
                Trova la taglia perfetta per te
              </p>
            </div>

            {/* Main table */}
            <div className="bg-white/50 rounded-xl overflow-hidden border border-emerald-100/70 mb-6">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-emerald-100/80 bg-emerald-50/40">
                    {["Taglia Emeraldress", "Taglia IT", "Bacino", "Vestibilità"].map((h) => (
                      <th
                        key={h}
                        className="py-3 px-3 sm:px-4 text-left text-emerald-800/80 tracking-[0.12em] uppercase font-medium text-[9px] sm:text-[10px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE_ED.map((row) => (
                    <tr key={row.size} className="border-b border-emerald-100/40 last:border-0">
                      <td
                        className="py-3 px-3 sm:px-4 text-emerald-950 font-medium tracking-[0.1em]"
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {row.size}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80">{row.it}</td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80">{row.bacino}</td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80 italic">{row.fit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Descriptive paragraph */}
            <p className="text-center text-xs sm:text-[13px] text-emerald-900/75 leading-relaxed max-w-xl mx-auto mb-7 italic">
              I capi <span className="not-italic font-medium tracking-wide">EMERALDRESS</span> sono
              realizzati in tessuti altamente elasticizzati e modellanti, studiati per adattarsi al
              corpo valorizzando la silhouette con comfort e sostegno.
            </p>

            {/* Divider with diamond */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="flex-1 h-px bg-emerald-700/20 max-w-[120px]" />
              <span className="w-2 h-2 rotate-45 bg-emerald-700/40" />
              <span className="flex-1 h-px bg-emerald-700/20 max-w-[120px]" />
            </div>

            <h4
              className="text-center text-base sm:text-lg tracking-[0.18em] uppercase text-emerald-950 mb-4"
              style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
            >
              Misure Indicative
            </h4>

            {/* Measures table */}
            <div className="bg-white/50 rounded-xl overflow-hidden border border-emerald-100/70">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-emerald-100/80 bg-emerald-50/40">
                    {["Taglia", "Seno", "Vita", "Fianchi"].map((h) => (
                      <th
                        key={h}
                        className="py-3 px-3 sm:px-4 text-left text-emerald-800/80 tracking-[0.12em] uppercase font-medium text-[9px] sm:text-[10px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE_MEASURES.map((row) => (
                    <tr key={row.size} className="border-b border-emerald-100/40 last:border-0">
                      <td
                        className="py-3 px-3 sm:px-4 text-emerald-950 font-medium tracking-[0.1em]"
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {row.size}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80">{row.seno}</td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80">{row.vita}</td>
                      <td className="py-3 px-3 sm:px-4 text-emerald-900/80">{row.fianchi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 text-center text-[11px] text-emerald-900/55 leading-relaxed">
              Le misure sono indicative. Per consigli personalizzati scrivici a{" "}
              <a
                href="mailto:emeraldresshop@gmail.com"
                className="underline hover:text-emerald-700 transition-colors"
              >
                emeraldresshop@gmail.com
              </a>
              .
            </p>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

// ── Desktop gallery ───────────────────────────────────────────────────────
const DesktopGallery = ({
  images,
  activeImage,
  setActiveImage,
  productName,
  onZoom,
}: {
  images: string[];
  activeImage: number;
  setActiveImage: (i: number) => void;
  productName: string;
  onZoom: () => void;
}) => {
  const goNext = () => setActiveImage((activeImage + 1) % images.length);
  const goPrev = () => setActiveImage((activeImage - 1 + images.length) % images.length);

  return (
    <div className="hidden lg:flex gap-4 h-full">
      {images.length > 1 && (
        <div className="flex flex-col gap-2 w-[88px] shrink-0">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImage(i)}
              className={cn(
                "relative w-full aspect-[3/4] overflow-hidden rounded-md transition-all duration-300 bg-emerald-50/50",
                activeImage === i
                  ? "ring-2 ring-emerald-700 ring-offset-2 ring-offset-[#f7fdf9]"
                  : "opacity-60 hover:opacity-100"
              )}
              aria-label={`Mostra immagine ${i + 1}`}
            >
              <ImageFallback src={img} alt="" className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden group rounded-xl bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-100/80">
        <AnimatePresence mode="wait">
          <motion.button
            key={activeImage}
            onClick={onZoom}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full cursor-zoom-in"
            aria-label="Ingrandisci immagine"
          >
            <ImageFallback
              src={images[activeImage]}
              alt={productName}
              className="w-full h-full object-contain"
            />
          </motion.button>
        </AnimatePresence>

        {images.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-emerald-100 shadow-sm hover:bg-white"
              aria-label="Immagine precedente"
            >
              <ChevronLeft size={16} className="text-emerald-900" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-emerald-100 shadow-sm hover:bg-white"
              aria-label="Immagine successiva"
            >
              <ChevronRight size={16} className="text-emerald-900" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-full transition-all duration-300 bg-emerald-900",
                    activeImage === i ? "w-5 h-1.5" : "w-1.5 h-1.5 opacity-30"
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Mobile gallery ────────────────────────────────────────────────────────
const MobileCarousel = ({
  images,
  productName,
  onIndexChange,
  currentIndex,
  onZoom,
}: {
  images: string[];
  productName: string;
  onIndexChange: (i: number) => void;
  currentIndex: number;
  onZoom: (i: number) => void;
}) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    onIndexChange(emblaApi.selectedScrollSnap());
  }, [emblaApi, onIndexChange]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="lg:hidden relative -mx-4">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {images.map((img, i) => (
            <div key={i} className="min-w-0 shrink-0 grow-0 basis-full">
              <button
                onClick={() => onZoom(i)}
                className="aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-emerald-50/60 to-white block"
                aria-label="Ingrandisci immagine"
              >
                <ImageFallback
                  src={img}
                  alt={`${productName} ${i + 1}`}
                  className="w-full h-full object-contain"
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {images.length > 1 && (
        <>
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-emerald-950/60 backdrop-blur-sm text-emerald-50 text-[10px] tracking-[0.2em]">
            {currentIndex + 1} / {images.length}
          </div>
          <div className="flex justify-center gap-1.5 mt-3 px-4">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => emblaApi?.scrollTo(i)}
                aria-label={`Vai a immagine ${i + 1}`}
                className={cn(
                  "rounded-full transition-all duration-300 bg-emerald-900",
                  currentIndex === i ? "w-6 h-1.5" : "w-1.5 h-1.5 opacity-30"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ── Fullscreen zoom ───────────────────────────────────────────────────────
const ZoomViewer = ({
  images,
  startIndex,
  onClose,
  productName,
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
  productName: string;
}) => {
  const [zoomed, setZoomed] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex, loop: true });

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem("pdp_zoom_hint_seen");
      if (!seen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHintVisible(true);
        window.localStorage.setItem("pdp_zoom_hint_seen", "1");
        const t = setTimeout(() => setHintVisible(false), 2200);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    if (zoomed) {
      emblaApi.reInit({ watchDrag: false });
    } else {
      emblaApi.reInit({ watchDrag: true });
    }
  }, [zoomed, emblaApi]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-emerald-950"
    >
      <button
        onClick={onClose}
        aria-label="Chiudi"
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md text-white flex items-center justify-center"
      >
        <X size={18} />
      </button>
      <div ref={emblaRef} className="overflow-hidden h-full">
        <div className="flex h-full">
          {images.map((img, i) => (
            <div key={i} className="min-w-0 shrink-0 grow-0 basis-full flex items-center justify-center">
              <TransformWrapper
                minScale={1}
                maxScale={3}
                doubleClick={{ mode: "toggle", step: 1.5 }}
                pinch={{ step: 5 }}
                wheel={{ step: 0.2 }}
                onZoom={(ref) => setZoomed(ref.state.scale > 1.01)}
                onZoomStop={(ref) => setZoomed(ref.state.scale > 1.01)}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: "100%", height: "100%" }}
                >
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <ImageFallback
                      src={img}
                      alt={`${productName} ${i + 1}`}
                      className="max-w-full max-h-full object-contain select-none"
                    />
                  </div>
                </TransformComponent>
              </TransformWrapper>
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {hintVisible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-md text-white text-[10px] tracking-[0.25em] uppercase pointer-events-none"
          >
            Pizzica per zoomare · doppio tap
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Star inline ───────────────────────────────────────────────────────────
const InlineRating = ({
  avg,
  count,
  onClick,
}: {
  avg: number;
  count: number;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 group"
    aria-label={`${avg.toFixed(1)} stelle su 5 — ${count} recensioni`}
  >
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={
            i <= Math.round(avg)
              ? "fill-amber-400 text-amber-400"
              : "text-emerald-200"
          }
        />
      ))}
    </span>
    <span className="text-[11px] tracking-[0.15em] uppercase text-emerald-900/70 group-hover:text-emerald-950 transition-colors">
      {count > 0 ? `${avg.toFixed(1)} · ${count} ${count === 1 ? "recensione" : "recensioni"}` : "Prima recensione"}
    </span>
  </button>
);

// ── Main client ───────────────────────────────────────────────────────────
export function ProductDetailClient({ product }: { product: Product }) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ avg: 0, count: 0 });
  const [stickyVisible, setStickyVisible] = useState(false);

  const { addItem, removeItem, hasItem } = useWishlist();
  const { addItem: addToCart, openCart, getCartQuantity, setStockForLine } = useCart();
  const { addProduct: trackRecentlyViewed } = useRecentlyViewed();
  const liked = hasItem(product.id);
  const reviewsRef = useRef<HTMLDivElement>(null);
  const buyPanelRef = useRef<HTMLDivElement>(null);

  // Parse sizes
  const sizes = useMemo(() => {
    const raw = product.sizes?.length ? product.sizes : ["XS/S", "S/M", "M/L"];
    return raw
      .flatMap((s) =>
        String(s)
          .replace(/[{}]/g, "")
          .trim()
          .split(/[,]|(?:\s*-\s+)|\s+-\s*/)
          .map((v) => v.trim())
      )
      .filter(Boolean);
  }, [product.sizes]);

  const images = product.images?.length
    ? product.images
    : [
        "https://jtmbnmpggzbucmgglisw.supabase.co/storage/v1/object/public/emerald-asset/faviconemeraldress.svg",
      ];

  const totalStock = useMemo(
    () =>
      sizes.reduce((acc, s) => acc + (product.stock_by_size?.[s] ?? 0), 0),
    [sizes, product.stock_by_size]
  );
  const allOutOfStock = totalStock <= 0;
  const lowStock = totalStock > 0 && totalStock <= 5;
  const stockForSelected = selectedSize ? product.stock_by_size?.[selectedSize] ?? 0 : 0;

  // Track recently viewed
  useEffect(() => {
    trackRecentlyViewed({
      id: product.id,
      slug: product.slug ?? null,
      name: product.name,
      image: product.images?.[0] ?? "",
      price: Number(product.price),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Fetch reviews summary
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("rating")
        .eq("product_id", product.id)
        .eq("is_approved", true);
      // Vedi ProductReviews.load: un errore qui si travestiva da "nessuna
      // recensione" e il voto medio spariva in silenzio.
      if (error) console.error("[product] load rating error:", error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = (data as any[]) ?? [];
      if (arr.length === 0) return;
      const sum = arr.reduce((s, r) => s + Number(r.rating ?? 0), 0);
      setReviewSummary({ avg: sum / arr.length, count: arr.length });
    })();
  }, [product.id]);

  // Sticky buy bar visibility (mobile, after buy panel is scrolled past)
  useEffect(() => {
    if (!buyPanelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(buyPanelRef.current);
    return () => observer.disconnect();
  }, []);

  // Wishlist toggle
  const toggleWishlist = async () => {
    if (liked) {
      removeItem(product.id);
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      setAuthOpen(true);
      return;
    }
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: images[0] ?? "",
    });
    toast.success("Aggiunto alla wishlist");
  };

  const scrollToReviews = () => {
    reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast.error("Seleziona una taglia", {
        description: "Scegli una taglia prima di aggiungere al carrello.",
      });
      buyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (stockForSelected <= 0) {
      toast.error("Taglia non disponibile");
      return;
    }
    // Vincolo: qty totale nel carrello (esistenti + 1) <= stock reale.
    const alreadyInCart = getCartQuantity(product.id, selectedSize);
    if (alreadyInCart >= stockForSelected) {
      toast.error("Disponibilità raggiunta", {
        description: `Hai già ${alreadyInCart} pezz${alreadyInCart === 1 ? "o" : "i"} nel carrello (max ${stockForSelected} per taglia ${selectedSize}).`,
      });
      openCart();
      return;
    }
    // Sincronizza lo stock noto al CartContext: il drawer cap automaticamente.
    const lineId = `${product.id}::${selectedSize}`;
    setStockForLine(lineId, stockForSelected);
    addToCart({
      productId: product.id,
      slug: product.slug ?? product.id,
      name: product.name.trim(),
      price: Number(product.price),
      image: images[0] ?? "",
      size: selectedSize,
    });
    toast.success("Aggiunto al carrello", {
      description: `${product.name.trim()} · Taglia ${selectedSize}`,
    });
    openCart();
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: product.name, url });
      } catch {
        /* canceled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiato");
      } catch {
        toast.error("Impossibile copiare il link");
      }
    }
  };

  return (
    <>
      <SizeGuideModal open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
      <AnimatePresence>{zoomOpen && (
        <ZoomViewer
          images={images}
          startIndex={activeImage}
          onClose={() => setZoomOpen(false)}
          productName={product.name}
        />
      )}</AnimatePresence>

      <main className="pt-28 pb-32 lg:pb-24" style={{ backgroundColor: "#f7fdf9" }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 md:mb-8">
            <Link
              href="/collezioni"
              className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-emerald-800/60 hover:text-emerald-950 transition-colors group"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
              Collezione
            </Link>
          </nav>

          {/* Hero: gallery + buy panel */}
          <div className="lg:grid lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_500px] lg:gap-14 xl:gap-20">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="lg:min-h-screen"
            >
              <div className="hidden lg:block h-[88vh] sticky top-28">
                <DesktopGallery
                  images={images}
                  activeImage={activeImage}
                  setActiveImage={setActiveImage}
                  productName={product.name}
                  onZoom={() => setZoomOpen(true)}
                />
              </div>

              <MobileCarousel
                images={images}
                productName={product.name}
                onIndexChange={setActiveImage}
                currentIndex={activeImage}
                onZoom={(i) => {
                  setActiveImage(i);
                  setZoomOpen(true);
                }}
              />
            </motion.div>

            <motion.div
              ref={buyPanelRef}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
              className="lg:sticky lg:top-28 lg:h-fit pt-8 lg:pt-0 flex flex-col"
            >
              {/* Eyebrow */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] tracking-[0.35em] uppercase text-emerald-700/70 font-medium">
                  {product.category?.replace(/-/g, " ") || "Emeraldress"} · Edizione Limitata
                </p>
                <button
                  onClick={handleShare}
                  aria-label="Condividi"
                  className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-emerald-50 text-emerald-800/70 hover:text-emerald-950 transition-colors"
                >
                  <Share2 size={16} />
                </button>
              </div>

              {/* Title */}
              <h1
                className="text-3xl md:text-4xl text-emerald-950 leading-tight mb-3"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                {product.name}
              </h1>

              {/* Rating */}
              <div className="mb-5">
                <InlineRating
                  avg={reviewSummary.avg}
                  count={reviewSummary.count}
                  onClick={scrollToReviews}
                />
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-3 mb-4">
                <span
                  className="text-3xl text-emerald-950"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                >
                  €{Number(product.price).toFixed(2)}
                </span>
                <span className="text-[11px] tracking-[0.2em] uppercase text-emerald-700/60">
                  IVA inclusa
                </span>
              </div>

              {/* Stock urgency */}
              {allOutOfStock ? (
                <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <p className="font-medium">Edizione esaurita</p>
                  <p className="mt-0.5 text-amber-800/80">Iscriviti per essere avvisata al restock.</p>
                </div>
              ) : lowStock ? (
                <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] tracking-[0.15em] uppercase font-medium">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="relative rounded-full w-2 h-2 bg-rose-500" />
                  </span>
                  Solo {totalStock} pezzi disponibili
                </div>
              ) : (
                <div className="mb-6 inline-flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase text-emerald-700/80">
                  <Check size={13} className="text-emerald-600" />
                  Disponibile · Spedizione 24h
                </div>
              )}

              <div className="h-px bg-emerald-100 mb-6" />

              {/* Size selector */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-800/70 font-medium">
                    Taglia
                    {selectedSize && (
                      <span className="ml-2 text-emerald-950 font-semibold">— {selectedSize}</span>
                    )}
                  </p>
                  <button
                    onClick={() => setSizeGuideOpen(true)}
                    className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-emerald-800/70 hover:text-emerald-950 transition-colors"
                  >
                    <Ruler size={11} />
                    Guida taglie
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                  {sizes.map((size) => {
                    const stockForSize = product.stock_by_size?.[size] ?? 0;
                    const outOfStock = stockForSize <= 0;
                    const isLow = !outOfStock && stockForSize <= 2;
                    const active = selectedSize === size;
                    return (
                      <motion.button
                        key={size}
                        onClick={() => {
                          if (outOfStock) return;
                          setSelectedSize(active ? null : size);
                        }}
                        disabled={outOfStock}
                        whileTap={outOfStock ? undefined : { scale: 0.96 }}
                        title={outOfStock ? "Esaurito" : isLow ? `Solo ${stockForSize} disponibili` : undefined}
                        className={cn(
                          "relative h-14 px-4 text-xs tracking-[0.15em] uppercase font-medium rounded-lg transition-all duration-200 flex flex-col items-center justify-center gap-0.5",
                          outOfStock &&
                            "border border-emerald-100 text-emerald-900/30 line-through cursor-not-allowed bg-emerald-50/40",
                          !outOfStock && active &&
                            "bg-emerald-950 text-emerald-50 shadow-[0_8px_24px_-8px_rgba(6,95,70,0.45)] border border-emerald-950",
                          !outOfStock && !active &&
                            "border border-emerald-200 bg-white text-emerald-950 hover:border-emerald-700 hover:bg-emerald-50"
                        )}
                        aria-label={`Taglia ${size}${outOfStock ? " (esaurita)" : ""}`}
                      >
                        <span>{size}</span>
                        {isLow && !active && (
                          <span className="text-[8px] tracking-wider text-rose-600 font-normal">
                            ultimi {stockForSize}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* CTA: Add to cart + Wishlist */}
              <div className="flex items-stretch gap-2 mb-3">
                {!allOutOfStock ? (
                  <motion.button
                    type="button"
                    onClick={handleAddToCart}
                    whileTap={selectedSize ? { scale: 0.99 } : {}}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2.5 text-xs tracking-[0.25em] uppercase font-medium rounded-lg py-4 transition-all duration-300",
                      selectedSize
                        ? "text-emerald-50 hover:shadow-[0_12px_30px_-10px_rgba(5,150,105,0.6)]"
                        : "bg-emerald-100 text-emerald-700/70 cursor-not-allowed"
                    )}
                    style={
                      selectedSize
                        ? {
                            background:
                              "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                          }
                        : undefined
                    }
                    aria-disabled={!selectedSize}
                  >
                    <ShoppingBag size={14} />
                    {selectedSize
                      ? `Aggiungi al carrello — ${selectedSize}`
                      : "Seleziona una taglia"}
                  </motion.button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2.5 text-xs tracking-[0.25em] uppercase rounded-lg py-4 bg-emerald-100 text-emerald-700/60 cursor-not-allowed">
                    <ShoppingBag size={14} />
                    Esaurito
                  </div>
                )}

                <motion.button
                  onClick={toggleWishlist}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "shrink-0 w-14 rounded-lg border-2 transition-all duration-200 flex items-center justify-center",
                    liked
                      ? "border-rose-500 bg-rose-500 text-white"
                      : "border-emerald-200 bg-white text-emerald-900 hover:border-emerald-700"
                  )}
                  aria-label={liked ? "Rimuovi dalla wishlist" : "Aggiungi alla wishlist"}
                >
                  <Heart size={16} fill={liked ? "currentColor" : "none"} strokeWidth={liked ? 0 : 2} />
                </motion.button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[10px] tracking-[0.2em] uppercase text-emerald-800/60 mb-7">
                <Lock size={10} />
                Pagamento sicuro · Stripe
              </div>

              {/* Trust strip */}
              <ul className="grid grid-cols-3 gap-3 mb-7 text-center">
                <li className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-emerald-100">
                  <Truck size={16} className="text-emerald-700" />
                  <span className="text-[10px] tracking-[0.15em] uppercase text-emerald-900 font-medium leading-tight">
                    Spedizione<br />gratis &gt;€200
                  </span>
                </li>
                <li className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-emerald-100">
                  <RotateCcw size={16} className="text-emerald-700" />
                  <span className="text-[10px] tracking-[0.15em] uppercase text-emerald-900 font-medium leading-tight">
                    Reso<br />14 giorni
                  </span>
                </li>
                <li className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-emerald-100">
                  <ShieldCheck size={16} className="text-emerald-700" />
                  <span className="text-[10px] tracking-[0.15em] uppercase text-emerald-900 font-medium leading-tight">
                    Garanzia<br />Made in Italy
                  </span>
                </li>
              </ul>

              {/* Accordion */}
              <Accordion type="single" collapsible defaultValue="description" className="w-full">
                <AccordionItem value="description" className="border-emerald-100">
                  <AccordionTrigger className="text-[11px] tracking-[0.25em] uppercase hover:no-underline py-4 text-emerald-950 font-medium">
                    Descrizione
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-emerald-900/75 leading-relaxed pb-5">
                    {product.description ||
                      "Un capo senza tempo che unisce artigianato italiano e materiali pregiati, pensato per chi cerca eleganza discreta e qualità duratura."}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="fabric" className="border-emerald-100">
                  <AccordionTrigger className="text-[11px] tracking-[0.25em] uppercase hover:no-underline py-4 text-emerald-950 font-medium">
                    Composizione & Cura
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-emerald-900/75 leading-relaxed pb-5">
                    {product.fabric_details ||
                      "Tessuto di alta qualità selezionato con cura. Per preservare la morbidezza e la forma del capo, si consiglia il lavaggio a mano in acqua fredda."}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shipping" className="border-emerald-100">
                  <AccordionTrigger className="text-[11px] tracking-[0.25em] uppercase hover:no-underline py-4 text-emerald-950 font-medium">
                    Spedizione & Resi
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-emerald-900/75 leading-relaxed pb-5 space-y-3">
                    <p>
                      {product.shipping_info ||
                        "Spedizione standard 3–5 giorni lavorativi in Italia. Spedizione espressa disponibile al checkout."}
                    </p>
                    <div>
                      <p className="font-medium text-emerald-950 mb-1.5">Diritto di recesso entro 14 giorni</p>
                      <p>
                        Hai 14 giorni dalla consegna per esercitare il diritto di recesso (art. 52 D.Lgs. 206/2005).
                        Il capo deve essere restituito:
                      </p>
                      <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-emerald-900/70">
                        <li><strong>mai indossato</strong>, integro e non lavato</li>
                        <li><strong>mai sporcato</strong>, senza profumi, macchie o alterazioni</li>
                        <li><strong>mai senza etichetta</strong> — cartellino originale attaccato</li>
                      </ul>
                      <p className="mt-1.5 text-[12px] text-emerald-900/60">
                        Spese di restituzione a carico del cliente. <a href="/resi" className="underline hover:text-emerald-700">Leggi la policy completa →</a>
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="sustainability" className="border-emerald-100">
                  <AccordionTrigger className="text-[11px] tracking-[0.25em] uppercase hover:no-underline py-4 text-emerald-950 font-medium">
                    Sostenibilità & Origine
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-emerald-900/75 leading-relaxed pb-5">
                    Realizzato in Italia con tessuto ECONYL®, fibra di nylon rigenerata
                    attraverso un processo di depolimerizzazione molecolare che parte da
                    reti da pesca recuperate dagli oceani, scarti tessili industriali e
                    rifiuti plastici post-consumo. Filiera 100% tracciata, manodopera
                    artigianale italiana, zero microplastiche rilasciate in lavaggio.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="mt-8 pt-6 border-t border-emerald-100 text-center">
                <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-800/50 font-medium">
                  Capsule Emerald Touch · Pezzo numerato
                </p>
              </div>
            </motion.div>
          </div>

          {/* Sustainability storytelling band */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-24 -mx-4 md:-mx-8 px-4 md:px-8 py-16 md:py-20 border-t border-b border-emerald-100"
            style={{ background: "linear-gradient(180deg, #f7fdf9 0%, #e6f7ec 100%)" }}
          >
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-[11px] tracking-[0.4em] uppercase font-bold text-emerald-600 mb-4">
                  Materia · Storia · Pianeta
                </p>
                <h2
                  className="text-3xl md:text-4xl text-emerald-950 max-w-2xl mx-auto leading-tight"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                >
                  Un capo che <span className="italic text-emerald-700">racconta</span> da dove
                  viene.
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Leaf,
                    eyebrow: "Materia",
                    title: "ECONYL® rigenerato",
                    desc: "Reti da pesca trasformate in filato di lusso. Stesse qualità del nylon vergine, zero impatto.",
                  },
                  {
                    icon: Hammer,
                    eyebrow: "Manifattura",
                    title: "Sartoria italiana",
                    desc: "Tagliato e cucito in laboratori certificati italiani con manodopera etica.",
                  },
                  {
                    icon: Sparkles,
                    eyebrow: "Filiera",
                    title: "Tracciabilità totale",
                    desc: "Ogni capo è numerato. Conosciamo l'origine di ogni filo, fino al mare.",
                  },
                ].map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <motion.div
                      key={c.title}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: i * 0.12 }}
                      className="rounded-2xl bg-white/70 backdrop-blur-sm border border-emerald-200/60 p-6 md:p-7"
                    >
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br from-emerald-700 to-emerald-900 shadow-[0_8px_20px_-6px_rgba(6,95,70,0.4)]">
                        <Icon className="w-5 h-5 text-emerald-50" strokeWidth={1.5} />
                      </div>
                      <p className="text-[10px] tracking-[0.3em] uppercase text-emerald-700/70 mb-2">
                        {c.eyebrow}
                      </p>
                      <h3
                        className="text-xl text-emerald-950 mb-2"
                        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                      >
                        {c.title}
                      </h3>
                      <p className="text-sm text-emerald-900/70 leading-relaxed">{c.desc}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-10 text-center">
                <Link
                  href="/sostenibilita"
                  className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-emerald-900 hover:text-emerald-700 transition-colors group"
                >
                  Scopri il processo
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </motion.section>

          {/* Reviews */}
          <div ref={reviewsRef}>
            <ProductReviews productId={product.id} />
          </div>

          {/* Cross-sell */}
          <RelatedProducts currentProductId={product.id} category={product.category} />

          {/* Recently viewed */}
          <RecentlyViewed excludeId={product.id} />
        </div>

        <RelatedLinks
          title="Continua a esplorare"
          links={[
            { to: "/", label: "Home", desc: "Torna all'esperienza visiva del brand.", eyebrow: "Inizio" },
            { to: "/collezioni", label: "Collezioni", desc: "Tutta la selezione Emerald Touch.", eyebrow: "Shop" },
            { to: "/sostenibilita", label: "Sostenibilità", desc: "La fibra rigenerata e il processo.", eyebrow: "Materia" },
            { to: "/emeraldscanner", label: "Emerald Scanner", desc: "Analizza un capo e scopri il suo impatto.", eyebrow: "Strumento" },
          ]}
        />
      </main>

      {/* Sticky mobile buy bar */}
      <AnimatePresence>
        {stickyVisible && !allOutOfStock && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-[0_-8px_24px_-8px_rgba(6,95,70,0.18)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center gap-3">
              <ImageFallback
                src={images[0]}
                alt={product.name}
                className="w-12 h-12 rounded-lg object-contain bg-emerald-50/60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-950 truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {product.name}
                </p>
                <p className="text-[11px] text-emerald-900/70">€{Number(product.price).toFixed(2)}</p>
              </div>
              {selectedSize ? (
                <button
                  onClick={handleAddToCart}
                  className="shrink-0 px-5 py-3 rounded-lg text-[11px] tracking-[0.2em] uppercase font-medium text-emerald-50 active:scale-95 transition"
                  style={{
                    background:
                      "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                  }}
                >
                  Aggiungi
                </button>
              ) : (
                <button
                  onClick={() => {
                    buyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    toast.error("Seleziona una taglia");
                  }}
                  className="shrink-0 px-5 py-3 rounded-lg text-[11px] tracking-[0.2em] uppercase font-medium bg-emerald-900 text-emerald-50 active:scale-95 transition"
                >
                  Scegli taglia
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        returnTo={typeof window !== "undefined" ? window.location.pathname : "/"}
        title="Salva nella tua wishlist"
        subtitle="Accedi o crea il tuo account per salvare i capi che ami."
        onAuthenticated={() => {
          addItem({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            image: images[0] ?? "",
          });
        }}
      />
    </>
  );
}
