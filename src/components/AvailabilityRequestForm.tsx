"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Product } from "@/hooks/useProducts";

const MAX_NOTE = 500;

interface Props {
  product: Product;
  onClose: () => void;
}

/**
 * Form "Richiedi disponibilità" per i capi in vetrina.
 *
 * Vive come overlay DENTRO il visore a tutto schermo, non come Dialog in
 * portale: il visore sta a z-[100] e un portale Radix (z-50) finirebbe sotto.
 *
 * Il capo è già noto e non si cambia. Le taglie sono quelle in cui il capo
 * esiste (products.sizes) e NON portano nessuna indicazione di disponibilità:
 * è il senso stesso della vetrina.
 */
export default function AvailabilityRequestForm({ product, onClose }: Props) {
  const supabase = getSupabaseBrowserClient();

  const sizes = useMemo(
    () => (product.sizes ?? []).filter((s): s is string => typeof s === "string" && s.length > 0),
    [product.sizes],
  );

  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Telefono precompilato dal profilo, se c'è. Fallisce in silenzio: è una
  // comodità, non un requisito, e il campo resta facoltativo.
  useEffect(() => {
    let annullato = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("phone_number")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("[availability] precompilazione telefono:", profileError);
        return;
      }
      const tel = (data as { phone_number?: string | null } | null)?.phone_number;
      if (!annullato && tel) setPhone(tel);
    })();
    return () => {
      annullato = true;
    };
  }, [supabase]);

  // Esc chiude, come ci si aspetta da un pannello sopra il visore.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!size) {
      setError("Scegli una taglia per continuare.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/availability-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, size, phone, note }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Non siamo riusciti a inviare la richiesta. Riprova.");
        return;
      }
      setDone(true);
    } catch {
      setError("Connessione non riuscita. Riprova fra un momento.");
    } finally {
      setSubmitting(false);
    }
  };

  const cover = product.images?.[0] ?? "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Richiedi disponibilità per ${product.name}`}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[90%] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3 min-w-0">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={product.name}
                className="w-12 h-16 object-cover rounded-lg shrink-0 bg-neutral-100"
              />
            )}
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.25em] uppercase text-emerald-700 font-medium">
                Richiedi disponibilità
              </p>
              <h2 className="font-serif text-lg text-neutral-900 truncate">{product.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="shrink-0 w-9 h-9 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <Check size={26} />
            </div>
            <p className="font-serif text-xl text-neutral-900 mb-2">Richiesta inviata</p>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Ti contattiamo per la disponibilità di{" "}
              <span className="text-neutral-800">{product.name}</span> in taglia{" "}
              <span className="text-neutral-800">{size}</span>.
            </p>
            <button
              onClick={onClose}
              className="mt-7 w-full h-12 rounded-full bg-emerald-950 text-white text-[11px] tracking-[0.25em] uppercase font-medium"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Taglia: obbligatoria. Sono le taglie in cui il capo esiste,
                non quelle disponibili: nessuna indicazione di stock. */}
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-500 font-medium mb-2.5 block">
                Taglia <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSize(s);
                      setError(null);
                    }}
                    aria-pressed={size === s}
                    className={`min-w-[64px] h-11 px-4 rounded-full text-sm transition-colors border ${
                      size === s
                        ? "bg-emerald-950 text-white border-emerald-950"
                        : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="ar-phone"
                className="text-[10px] tracking-[0.2em] uppercase text-neutral-500 font-medium mb-2 block"
              >
                Telefono <span className="normal-case tracking-normal text-neutral-400">(facoltativo)</span>
              </label>
              <input
                id="ar-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                maxLength={32}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Per risponderti più in fretta"
                className="w-full h-12 rounded-xl border border-neutral-200 px-4 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="ar-note"
                className="text-[10px] tracking-[0.2em] uppercase text-neutral-500 font-medium mb-2 block"
              >
                Note <span className="normal-case tracking-normal text-neutral-400">(facoltative)</span>
              </label>
              <textarea
                id="ar-note"
                value={note}
                maxLength={MAX_NOTE}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Es. la data dell’evento. Non servono altri dettagli personali."
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-900 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <p className="text-[10px] text-neutral-400 mt-1.5 text-right">
                {note.length}/{MAX_NOTE}
              </p>
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full h-12 rounded-full bg-emerald-950 hover:bg-emerald-900 disabled:opacity-60 text-white text-[11px] tracking-[0.25em] uppercase font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Invio…
                </>
              ) : (
                "Invia richiesta"
              )}
            </button>

            {/* Informativa nel punto di raccolta: l'art. 13 GDPR chiede che
                l'interessato sappia finalita' e conservazione QUI, non solo
                in una pagina che potrebbe non aprire mai. */}
            <p className="text-[11px] leading-relaxed text-neutral-400 text-center">
              Usiamo questi dati solo per risponderti su questo capo e li conserviamo per 12
              mesi dalla chiusura della richiesta.{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                Informativa privacy
              </a>
              .
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
