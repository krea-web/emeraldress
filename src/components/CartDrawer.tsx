"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, X, Minus, Plus, Trash2, Loader2, Lock, Truck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCart } from "@/contexts/CartContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import RecentlyViewed from "@/components/RecentlyViewed";
// Stessa costante che usa /api/checkout per decidere la shipping_option: se la
// barra di progresso e il server divergono, il cliente vede una promessa che
// al checkout non viene mantenuta.
import { FREE_SHIPPING_THRESHOLD_EUR as FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";

export function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    updateQuantity,
    removeItem,
    totalItems,
    totalPrice,
    stockByLine,
    setStockForLine,
  } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Quando il drawer si apre: rilegge lo stock REALE dal DB per ogni line.
  // Se uno stock e' inferiore alla qty in carrello → cap automatico + toast.
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const productIds = Array.from(new Set(items.map((i) => i.productId)));
      const { data, error } = await supabase
        .from("products")
        .select("id, stock_by_size")
        .in("id", productIds);
      if (cancelled || error || !data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stockMap = new Map<string, Record<string, number>>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any[]).map((p) => [p.id, (p.stock_by_size ?? {}) as Record<string, number>]),
      );
      let cappedAny = false;
      for (const item of items) {
        const stock = Number(stockMap.get(item.productId)?.[item.size] ?? 0);
        setStockForLine(item.lineId, stock);
        if (item.quantity > stock) {
          updateQuantity(item.lineId, stock); // cap (rimuove se 0)
          cappedAny = true;
        }
      }
      if (cappedAny) {
        toast.warning("Quantità adeguata alla disponibilità", {
          description: "Alcune taglie sono in esaurimento e abbiamo aggiornato il carrello.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - totalPrice);
  const progressPct = Math.min(100, (totalPrice / FREE_SHIPPING_THRESHOLD) * 100);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsCheckingOut(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            size: i.size,
            quantity: i.quantity,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Errore checkout" }));
        throw new Error(errBody.error || "Checkout fallito");
      }
      const { url } = await res.json();
      if (!url) throw new Error("URL checkout mancante");
      window.location.href = url;
    } catch (e) {
      toast.error("Impossibile avviare il checkout", {
        description: e instanceof Error ? e.message : "Riprova tra qualche istante.",
      });
      setIsCheckingOut(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(v) => (v ? null : closeCart())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
        style={{ backgroundColor: "#f7fdf9" }}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-5 border-b border-emerald-100/80 bg-white/60 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.35em] uppercase text-emerald-700/65">Borsa</p>
              <h2
                className="text-2xl text-emerald-950 mt-0.5"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                Il tuo carrello{" "}
                {totalItems > 0 && (
                  <span className="text-base text-emerald-700/80 align-middle ml-1">
                    · {totalItems}
                  </span>
                )}
              </h2>
            </div>
            <button
              onClick={closeCart}
              aria-label="Chiudi"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-emerald-100/60 text-emerald-800/70 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Free shipping progress */}
          {items.length > 0 && (
            <div className="mt-4">
              {remainingForFreeShipping > 0 ? (
                <p className="text-[11px] text-emerald-900/70 mb-1.5">
                  Aggiungi €{remainingForFreeShipping.toFixed(2)} per la spedizione gratuita
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 font-medium mb-1.5 flex items-center gap-1.5">
                  <Truck size={11} />
                  Spedizione gratuita sbloccata
                </p>
              )}
              <div className="h-1 rounded-full bg-emerald-100 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-800 rounded-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200/60"
              >
                <ShoppingBag className="w-7 h-7 text-emerald-700/70" strokeWidth={1.5} />
              </div>
              <p
                className="text-xl text-emerald-950 mb-2"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                La tua borsa è vuota
              </p>
              <p className="text-sm text-emerald-900/60 max-w-xs leading-relaxed">
                Scopri la capsule Emerald Touch e aggiungi i capi che ami.
              </p>
              <button
                onClick={closeCart}
                className="mt-7 inline-flex items-center gap-2 px-7 py-3 rounded-full text-[11px] tracking-[0.25em] uppercase font-medium border border-emerald-900 text-emerald-950 hover:bg-emerald-900 hover:text-emerald-50 transition-all"
              >
                Esplora la collezione
              </button>

              <div className="w-full mt-10 text-left" onClick={closeCart}>
                <RecentlyViewed title="Hai guardato di recente" compact />
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const stockKnown = stockByLine[item.lineId];
                  const atMax = typeof stockKnown === "number" && item.quantity >= stockKnown;
                  const lowStock =
                    typeof stockKnown === "number" && stockKnown > 0 && stockKnown <= 3;
                  return (
                    <motion.li
                      key={item.lineId}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-3 p-3 rounded-xl border border-emerald-100 bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-24 sm:w-24 sm:h-28 object-contain rounded-lg bg-emerald-50/50 shrink-0"
                      />
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p
                            className="text-sm text-emerald-950 leading-tight"
                            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
                          >
                            {item.name}
                          </p>
                          <button
                            onClick={() => removeItem(item.lineId)}
                            aria-label="Rimuovi articolo"
                            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-emerald-800/50 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="text-[10px] tracking-[0.2em] uppercase text-emerald-700/60 mb-1">
                          Taglia · {item.size}
                        </p>
                        {lowStock && (
                          <p className="text-[10px] tracking-[0.15em] uppercase text-rose-600 mb-2 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            {stockKnown === 1
                              ? "Ultimo pezzo disponibile"
                              : `Solo ${stockKnown} disponibili`}
                          </p>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2">
                          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white">
                            <button
                              onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                              aria-label="Diminuisci"
                              className="w-8 h-8 flex items-center justify-center text-emerald-800 hover:text-emerald-950 disabled:opacity-40"
                              disabled={item.quantity <= 1}
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-7 text-center text-sm tabular-nums text-emerald-950">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => {
                                if (atMax) {
                                  toast.error("Hai raggiunto la disponibilità", {
                                    description: `Solo ${stockKnown} pezzi disponibili in taglia ${item.size}.`,
                                  });
                                  return;
                                }
                                updateQuantity(item.lineId, item.quantity + 1);
                              }}
                              aria-label="Aumenta"
                              className={cn(
                                "w-8 h-8 flex items-center justify-center transition-colors",
                                atMax
                                  ? "text-emerald-300 cursor-not-allowed"
                                  : "text-emerald-800 hover:text-emerald-950",
                              )}
                              disabled={atMax}
                              title={atMax ? "Stock massimo raggiunto" : undefined}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-sm font-medium text-emerald-950 tabular-nums">
                            €{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 sm:px-6 py-5 border-t border-emerald-100 bg-white/80 backdrop-blur-sm space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-900/70">Subtotale</span>
              <span className="text-emerald-950 font-medium tabular-nums">
                €{totalPrice.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-900/70">Spedizione</span>
              <span className="text-emerald-950 font-medium tabular-nums">
                {remainingForFreeShipping > 0 ? "Calcolata al checkout" : "Gratuita"}
              </span>
            </div>
            <div className="border-t border-emerald-100 pt-3 flex items-center justify-between">
              <span
                className="text-emerald-950"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
              >
                Totale
              </span>
              <span
                className="text-xl text-emerald-950 tabular-nums"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                €{totalPrice.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className={cn(
                "w-full py-4 rounded-lg text-[11px] tracking-[0.25em] uppercase font-medium transition-all flex items-center justify-center gap-2",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
              style={{
                background: "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                color: "#f0fdf4",
                boxShadow: "0 12px 30px -10px rgba(5,150,105,0.45)",
              }}
            >
              {isCheckingOut ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Reindirizzamento…
                </>
              ) : (
                <>
                  <Lock size={13} />
                  Procedi al checkout
                </>
              )}
            </button>

            <p className="text-[10px] text-center tracking-[0.2em] uppercase text-emerald-800/55">
              Pagamento sicuro · Stripe
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
