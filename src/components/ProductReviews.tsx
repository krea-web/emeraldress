"use client";

import { useEffect, useState, useCallback, useMemo, FormEvent, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Loader2, MessageCircle, BadgeCheck, ChevronDown, PenLine, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthDialog } from "./AuthDialog";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  customer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user_id?: string | null;
  photo_urls?: string[] | null;
}

const MAX_REVIEW_PHOTOS = 3;
const PHOTO_BUCKET = "review-photos";

// Compressione lato client: ridimensiona long-edge a 1600px e codifica WebP q=0.82.
// Tipicamente porta 4-8 MB di foto smartphone a ~120-250 KB senza perdita visiva.
async function compressToWebp(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compressione fallita"))),
      "image/webp",
      quality,
    );
  });
}

type SortMode = "recent" | "highest" | "lowest";

// ── Star row ──────────────────────────────────────────────────────────────
const StarRow = ({
  value,
  onChange,
  size = 16,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) => (
  <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : undefined}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type={onChange ? "button" : undefined}
        onClick={onChange ? () => onChange(n) : undefined}
        disabled={!onChange}
        aria-label={onChange ? `${n} stelle` : undefined}
        className={onChange ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"}
      >
        <Star
          size={size}
          className={n <= value ? "fill-amber-400 text-amber-400" : "text-emerald-200"}
          strokeWidth={1.5}
        />
      </button>
    ))}
  </div>
);

// ── Rating breakdown ──────────────────────────────────────────────────────
const RatingBreakdown = ({ reviews }: { reviews: Review[] }) => {
  const counts = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => Math.round(r.rating) === stars).length,
  }));
  const total = reviews.length || 1;
  return (
    <div className="space-y-1.5">
      {counts.map(({ stars, count }) => {
        const pct = (count / total) * 100;
        return (
          <div key={stars} className="flex items-center gap-3 text-[11px]">
            <span className="w-3 text-emerald-900/70 font-medium tabular-nums">{stars}</span>
            <Star size={11} className="fill-amber-400 text-amber-400" strokeWidth={0} />
            <div className="flex-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400"
              />
            </div>
            <span className="w-6 text-right text-emerald-900/60 tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
};

const supabase = getSupabaseBrowserClient();

const ProductReviews = ({ productId }: { productId: string }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sort, setSort] = useState<SortMode>("recent");
  const [authOpen, setAuthOpen] = useState(false);
  const [authedUser, setAuthedUser] = useState<{ id: string; email: string | null } | null>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const addPhotos = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => {
      const space = MAX_REVIEW_PHOTOS - prev.length;
      if (space <= 0) {
        toast.error(`Max ${MAX_REVIEW_PHOTOS} foto per recensione`);
        return prev;
      }
      const accepted = arr.slice(0, space);
      const newOnes = accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...prev, ...newOnes];
    });
  }, []);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }, []);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reviews")
      .select("id, customer_name, rating, comment, created_at, user_id, photo_urls")
      .eq("product_id", productId)
      .eq("is_approved", true);
    // Senza questo log un errore diventava indistinguibile da "questo capo non
    // ha recensioni": `data` torna null, `|| []` lo traduce in lista vuota e la
    // scheda sembra solo priva di recensioni. E' cosi' che un 401 sulla RLS e'
    // rimasto invisibile per mesi. Se fallisce, ora almeno si vede in console.
    if (error) console.error("[reviews] load error:", error);
    setReviews((data as Review[]) || []);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setAuthedUser(u ? { id: u.id, email: u.email ?? null } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const u = s?.user;
      setAuthedUser(u ? { id: u.id, email: u.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Prefill name when user is logged in
  useEffect(() => {
    if (authedUser && !name) {
      // Try to use profile name; fallback to email handle
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", authedUser.id)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = data as any;
        if (p?.first_name) {
          setName([p.first_name, p.last_name].filter(Boolean).join(" "));
        } else if (authedUser.email) {
          setName(authedUser.email.split("@")[0]);
        }
      })();
    }
  }, [authedUser, name]);

  const handleStart = () => {
    if (!authedUser) {
      setAuthOpen(true);
      return;
    }
    setShowForm((v) => !v);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!authedUser) {
      setAuthOpen(true);
      return;
    }
    if (!name.trim() || rating < 1 || rating > 5) {
      toast.error("Inserisci nome e valutazione");
      return;
    }
    setSubmitting(true);
    try {
      // 1) Genero l'id review lato client cosi' posso linkare le foto con un
      //    path stabile prima di insert. Se l'insert fallisce, le foto restano
      //    orphan ma il trigger di delete review le pulira' su fix manuale.
      const reviewId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // 2) Comprimi e carica le foto a `review-photos/{user_id}/{review_id}-{i}.webp`
      const photoUrls: string[] = [];
      if (photos.length > 0) {
        toast.loading("Carico le foto…", { id: "upload-photos" });
        for (let i = 0; i < photos.length; i++) {
          const blob = await compressToWebp(photos[i].file);
          const path = `${authedUser.id}/${reviewId}-${i}.webp`;
          const { error: upErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, blob, { contentType: "image/webp", upsert: true });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
          photoUrls.push(pub.publicUrl);
        }
        toast.dismiss("upload-photos");
      }

      // 3) Insert review con id pre-generato + photo_urls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("reviews") as any).insert({
        id: reviewId,
        product_id: productId,
        customer_name: name.trim(),
        rating,
        comment: comment.trim() || null,
        is_approved: false,
        user_id: authedUser.id,
        photo_urls: photoUrls,
      });
      if (error) throw error;

      toast.success("Grazie!", {
        description: photoUrls.length > 0
          ? `Recensione + ${photoUrls.length} ${photoUrls.length === 1 ? "foto inviata" : "foto inviate"}. Pubblicazione entro 24h.`
          : "La tua recensione sarà pubblicata dopo l'approvazione.",
      });
      // Reset form
      setComment("");
      setRating(5);
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setShowForm(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[reviews] submit error:", err);
      toast.dismiss("upload-photos");
      toast.error("Errore. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const avg =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const positivePct =
    reviews.length > 0
      ? Math.round((reviews.filter((r) => r.rating >= 4).length / reviews.length) * 100)
      : 0;

  const sortedReviews = useMemo(() => {
    const arr = [...reviews];
    switch (sort) {
      case "highest":
        arr.sort((a, b) => b.rating - a.rating || +new Date(b.created_at) - +new Date(a.created_at));
        break;
      case "lowest":
        arr.sort((a, b) => a.rating - b.rating || +new Date(b.created_at) - +new Date(a.created_at));
        break;
      default:
        arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return arr;
  }, [reviews, sort]);

  return (
    <section className="mt-24 pt-16 border-t border-emerald-100" aria-labelledby="reviews-heading">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-[11px] tracking-[0.4em] uppercase font-bold text-emerald-600 mb-3">
            Voci · Esperienze
          </p>
          <h2
            id="reviews-heading"
            className="text-3xl md:text-4xl text-emerald-950"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
          >
            Cosa dicono di <span className="italic text-emerald-700">questo capo</span>
          </h2>
        </div>

        {/* Summary card — solo se ci sono recensioni */}
        {!loading && reviews.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 md:gap-12 mb-10 rounded-2xl border border-emerald-100 bg-white p-6 md:p-8 shadow-[0_10px_30px_-18px_rgba(6,95,70,0.15)]">
            <div className="flex flex-col items-center md:items-start justify-center text-center md:text-left">
              <span
                className="text-6xl text-emerald-950 leading-none mb-3"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                {avg.toFixed(1)}
              </span>
              <StarRow value={Math.round(avg)} size={18} />
              <p className="text-xs text-emerald-900/70 mt-2 tracking-wide">
                Basato su {reviews.length} {reviews.length === 1 ? "recensione" : "recensioni"}
              </p>
              {positivePct >= 80 && (
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] tracking-[0.2em] uppercase font-medium">
                  <BadgeCheck size={12} />
                  {positivePct}% raccomandato
                </div>
              )}
            </div>
            <div className="md:border-l md:border-emerald-100 md:pl-12">
              <RatingBreakdown reviews={reviews} />
            </div>
          </div>
        )}

        {/* Toolbar — solo quando ci sono recensioni (button + sort affiancati) */}
        {!loading && reviews.length > 0 && (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 mb-8">
            <button
              onClick={handleStart}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[11px] tracking-[0.25em] uppercase font-medium transition-all hover:opacity-95 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                color: "#f0fdf4",
                boxShadow: "0 8px 24px -10px rgba(5,150,105,0.45)",
              }}
            >
              <PenLine size={13} />
              {showForm ? "Annulla" : "Scrivi una recensione"}
            </button>

            <div className="relative self-start sm:self-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-emerald-200 bg-white text-xs tracking-[0.15em] uppercase text-emerald-950 focus:outline-none focus:border-emerald-700 cursor-pointer"
              >
                <option value="recent">Più recenti</option>
                <option value="highest">Più alte</option>
                <option value="lowest">Più basse</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-700"
              />
            </div>
          </div>
        )}

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              transition={{ duration: 0.3 }}
              onSubmit={submit}
              className="mb-10 overflow-hidden"
            >
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/40 to-white p-6 md:p-8 space-y-5">
                <div className="flex items-start gap-3">
                  <Sparkle />
                  <div>
                    <h3
                      className="text-lg text-emerald-950"
                      style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
                    >
                      Condividi la tua esperienza
                    </h3>
                    <p className="text-xs text-emerald-900/65 mt-1">
                      La tua opinione aiuta altre donne a scegliere consapevolmente.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/70 mb-2 font-medium">
                    Il tuo nome
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    className="w-full px-4 py-3 rounded-lg border border-emerald-200 bg-white text-sm text-emerald-950 outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-300 transition-all"
                    placeholder="Come ti chiami?"
                  />
                </div>

                <div>
                  <label className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/70 mb-3 font-medium">
                    La tua valutazione
                  </label>
                  <StarRow value={rating} onChange={setRating} size={26} />
                </div>

                <div>
                  <label className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/70 mb-2 font-medium">
                    Il tuo commento
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="Vestibilità, qualità del tessuto, sensazione al tatto…"
                    className="w-full px-4 py-3 rounded-lg border border-emerald-200 bg-white text-sm text-emerald-950 outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-300 transition-all resize-none"
                  />
                  <p className="text-[10px] text-emerald-800/50 mt-1.5 text-right">
                    {comment.length}/1000
                  </p>
                </div>

                {/* Photo upload: max 3 foto, compressione WebP client-side */}
                <div>
                  <label className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/70 mb-2 font-medium">
                    Le tue foto <span className="lowercase tracking-normal text-emerald-700/55 ml-1">(facoltative · max 3)</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((p, idx) => (
                      <div
                        key={p.preview}
                        className="relative aspect-square rounded-lg overflow-hidden border border-emerald-200 group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          aria-label="Rimuovi foto"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-emerald-950/80 text-emerald-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_REVIEW_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-emerald-300 hover:border-emerald-600 hover:bg-emerald-50/50 flex flex-col items-center justify-center gap-1 transition-colors text-emerald-700"
                        aria-label="Aggiungi foto"
                      >
                        <Camera size={20} strokeWidth={1.5} />
                        <span className="text-[10px] tracking-[0.15em] uppercase">Aggiungi</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-800/55 mt-1.5 italic">
                    Mostra il capo indossato — le foto sono visibili pubblicamente dopo l&apos;approvazione.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-lg text-[11px] tracking-[0.25em] uppercase font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background:
                      "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                    color: "#f0fdf4",
                    boxShadow: "0 8px 24px -10px rgba(5,150,105,0.45)",
                  }}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={13} className="animate-spin" />
                      Invio in corso…
                    </span>
                  ) : (
                    "Pubblica recensione"
                  )}
                </button>
                <p className="text-[10px] text-emerald-800/55 text-center italic">
                  La recensione sarà visibile dopo l&apos;approvazione (entro 24h).
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* List */}
        {loading ? (
          <div className="rounded-2xl border border-emerald-100/70 bg-white/60 p-8 md:p-12 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 md:gap-12 animate-pulse">
            <div className="flex flex-col items-center md:items-start gap-3">
              <div className="h-16 w-20 rounded-md bg-emerald-100/50" />
              <div className="h-4 w-32 rounded bg-emerald-100/40" />
              <div className="h-3 w-40 rounded bg-emerald-100/30" />
            </div>
            <div className="md:border-l md:border-emerald-100 md:pl-12 space-y-2.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-6 rounded bg-emerald-100/40" />
                  <div className="flex-1 h-1.5 rounded-full bg-emerald-100/40" />
                </div>
              ))}
            </div>
          </div>
        ) : sortedReviews.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/40 to-white text-center px-6 py-14 md:py-20"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 0%, rgba(16,185,129,0.10) 0%, transparent 70%), radial-gradient(40% 40% at 100% 100%, rgba(5,150,105,0.06) 0%, transparent 70%)",
              }}
            />

            <div className="relative">
              <div
                className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-gradient-to-br from-emerald-700 to-emerald-900 shadow-[0_12px_30px_-10px_rgba(6,95,70,0.45)]"
              >
                <MessageCircle className="w-6 h-6 text-emerald-50" strokeWidth={1.5} />
              </div>

              <p className="text-[10px] tracking-[0.4em] uppercase text-emerald-700/60 mb-3">
                Inaugura · le voci
              </p>

              <h3
                className="text-2xl md:text-3xl text-emerald-950 max-w-md mx-auto leading-tight mb-3"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
              >
                Sii la <span className="italic text-emerald-700">prima voce</span> a raccontare questo capo
              </h3>

              <p className="text-sm text-emerald-900/65 max-w-md mx-auto leading-relaxed mb-7">
                Vestibilità, qualità del tessuto, sensazione al tatto: la tua esperienza ispira la
                community Emeraldress.
              </p>

              {!showForm && (
                <button
                  onClick={handleStart}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-[11px] tracking-[0.25em] uppercase font-medium transition-all hover:opacity-95 active:scale-[0.98]"
                  style={{
                    background:
                      "linear-gradient(135deg, #052e1f 0%, #064e3b 45%, #047857 100%)",
                    color: "#f0fdf4",
                    boxShadow: "0 12px 30px -10px rgba(5,150,105,0.45)",
                  }}
                >
                  <PenLine size={13} />
                  Scrivi la prima recensione
                </button>
              )}

              <div className="mt-7 flex items-center justify-center gap-3 text-[10px] tracking-[0.25em] uppercase text-emerald-700/55">
                <span className="flex items-center gap-1.5">
                  <BadgeCheck size={11} />
                  Solo clienti verificati
                </span>
                <span className="w-1 h-1 rounded-full bg-emerald-700/40" />
                <span>Pubblicata entro 24h</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <ul className="space-y-5">
            {sortedReviews.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: Math.min(i, 4) * 0.05 }}
                className="rounded-xl border border-emerald-100 bg-white p-5 md:p-6 transition-shadow hover:shadow-[0_10px_30px_-18px_rgba(6,95,70,0.18)]"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-emerald-50 text-sm shrink-0 border border-emerald-200"
                      style={{
                        background:
                          "linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)",
                        fontFamily: "'Playfair Display', serif",
                      }}
                    >
                      {r.customer_name?.[0]?.toUpperCase() ?? "E"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm text-emerald-950"
                          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
                        >
                          {r.customer_name}
                        </span>
                        {r.user_id && (
                          <span className="inline-flex items-center gap-1 text-[9px] tracking-[0.15em] uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <BadgeCheck size={9} />
                            Verificata
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <StarRow value={r.rating} size={12} />
                        <span className="text-[10px] tracking-[0.15em] uppercase text-emerald-700/55">
                          {new Date(r.created_at).toLocaleDateString("it-IT", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {r.comment && (
                  <p className="text-sm text-emerald-900/80 leading-relaxed pl-13">{r.comment}</p>
                )}
                {r.photo_urls && r.photo_urls.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 max-w-md">
                    {r.photo_urls.map((url, pIdx) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setLightbox({ urls: r.photo_urls!, index: pIdx })}
                        className="aspect-square rounded-lg overflow-hidden border border-emerald-100 hover:opacity-90 transition-opacity"
                        aria-label={`Apri foto ${pIdx + 1} di ${r.customer_name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Foto di ${r.customer_name}`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {/* Lightbox foto recensioni */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
            role="dialog"
            aria-label="Foto recensione"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              aria-label="Chiudi"
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.urls[lightbox.index]}
              alt=""
              className="max-w-full max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            {lightbox.urls.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {lightbox.urls.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: i }); }}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      i === lightbox.index ? "bg-white w-6" : "bg-white/40"
                    )}
                    aria-label={`Foto ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        returnTo={typeof window !== "undefined" ? window.location.pathname : "/"}
        title="Accedi per recensire"
        subtitle="Solo i clienti registrati possono lasciare una recensione."
        onAuthenticated={() => {
          setShowForm(true);
        }}
      />
    </section>
  );
};

const Sparkle = () => (
  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-700 to-emerald-900 shadow-[0_8px_20px_-6px_rgba(6,95,70,0.35)] shrink-0">
    <Star className="w-4 h-4 text-emerald-50" fill="currentColor" strokeWidth={0} />
  </div>
);

export default ProductReviews;
