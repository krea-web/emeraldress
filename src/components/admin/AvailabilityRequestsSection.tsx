"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Mail, Phone, Inbox } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// Cast a any: stesso workaround del resto dell'admin per l'inferenza dei
// generics di @supabase/ssr. La sicurezza resta sulla RLS lato server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = getSupabaseBrowserClient() as any;

export type RequestStatus = "nuova" | "contattata" | "chiusa";

export interface AvailabilityRequestRow {
  id: string;
  created_at: string;
  /** null se il capo è stato cancellato: la richiesta resta, si legge da product_name. */
  product_id: string | null;
  product_name: string;
  customer_email: string | null;
  customer_name: string | null;
  size: string;
  phone: string | null;
  note: string | null;
  status: RequestStatus;
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  nuova: "Nuova",
  contattata: "Contattata",
  chiusa: "Chiusa",
};

const STATUS_PILL: Record<RequestStatus, string> = {
  nuova: "bg-amber-50 text-amber-700",
  contattata: "bg-sky-50 text-sky-700",
  chiusa: "bg-neutral-100 text-neutral-500",
};

type FilterTab = "tutte" | RequestStatus;

function normalizeStatus(v: string | null | undefined): RequestStatus {
  return v === "contattata" || v === "chiusa" ? v : "nuova";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

/**
 * Sezione "Richieste" del gestionale: le richieste di disponibilità arrivate
 * dai capi in vetrina. È la fonte di verità — l'email di avviso è best effort
 * e può non essere mai partita (oggi il server n8n è giù).
 *
 * Vive in un componente suo: admin-client.tsx ha già quasi quattromila righe.
 */
export function AvailabilityRequestsSection({
  productImages,
  onCountChange,
}: {
  /** id prodotto → prima immagine, per la miniatura. */
  productImages?: Record<string, string | undefined>;
  /** Comunica all'admin quante sono "nuove", per il contatore nel menu. */
  onCountChange?: (nuove: number) => void;
}) {
  const [rows, setRows] = useState<AvailabilityRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("tutte");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("availability_requests")
      .select(
        "id, created_at, product_id, product_name, customer_email, customer_name, size, phone, note, status",
      )
      .order("created_at", { ascending: false });

    if (error) {
      // Mai in silenzio: una lista vuota per un errore di permessi sembrerebbe
      // "nessuna richiesta", ed e' esattamente come le recensioni sono rimaste
      // invisibili per mesi.
      console.error("[admin/richieste] load error:", error);
      toast.error("Impossibile caricare le richieste");
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data as AvailabilityRequestRow[]) ?? [];
    setRows(list);
    // Il contatore si aggiorna qui, dove i dati arrivano davvero: farlo in un
    // effect significherebbe scrivere nello stato del padre durante il render.
    onCountChange?.(list.filter((r) => normalizeStatus(r.status) === "nuova").length);
    setLoading(false);
  }, [onCountChange]);

  // Caricamento al montaggio: `load` mette `loading` a true subito, e la regola
  // lo legge come setState dentro un effect. E' lo stesso schema gia' usato da
  // ProductReviews: caricare dati all'apertura E' il lavoro di un effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const nuove = useMemo(
    () => rows.filter((r) => normalizeStatus(r.status) === "nuova").length,
    [rows],
  );

  const visible = useMemo(
    () => (tab === "tutte" ? rows : rows.filter((r) => normalizeStatus(r.status) === tab)),
    [rows, tab],
  );

  async function changeStatus(row: AvailabilityRequestRow, next: RequestStatus) {
    if (normalizeStatus(row.status) === next) return;
    setSavingId(row.id);
    const { error } = await supabase
      .from("availability_requests")
      .update({ status: next })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      console.error("[admin/richieste] update error:", error);
      toast.error(error.message || "Errore nel salvataggio");
      return;
    }
    const updated = rows.map((r) => (r.id === row.id ? { ...r, status: next } : r));
    setRows(updated);
    onCountChange?.(updated.filter((r) => normalizeStatus(r.status) === "nuova").length);
    toast.success(`${row.product_name} → ${STATUS_LABEL[next]}`);
  }

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "tutte", label: "Tutte", count: rows.length },
    { id: "nuova", label: "Nuove", count: nuove },
    {
      id: "contattata",
      label: "Contattate",
      count: rows.filter((r) => normalizeStatus(r.status) === "contattata").length,
    },
    {
      id: "chiusa",
      label: "Chiuse",
      count: rows.filter((r) => normalizeStatus(r.status) === "chiusa").length,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium text-neutral-900">Richieste di disponibilità</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Arrivano dai capi in vetrina. Questa lista è la fonte di verità: l&apos;email di
            avviso è un di più e può non essere partita.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 h-9 px-4 rounded-xl border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-8 px-3.5 rounded-full text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-emerald-950 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {t.label} <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <Inbox className="w-8 h-8 mx-auto text-neutral-200 mb-3" />
          <p className="text-sm text-neutral-400">
            {rows.length === 0
              ? "Nessuna richiesta ancora."
              : "Nessuna richiesta in questo stato."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const st = normalizeStatus(r.status);
            // Capo cancellato: niente miniatura, ma il nome fotografato resta.
            const img = r.product_id ? productImages?.[r.product_id] : undefined;
            return (
              <div
                key={r.id}
                className="border border-neutral-100 rounded-2xl p-4 bg-white flex flex-col sm:flex-row gap-4"
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={r.product_name}
                    className="w-14 h-20 object-cover rounded-lg shrink-0 bg-neutral-100"
                  />
                ) : (
                  <div className="w-14 h-20 rounded-lg shrink-0 bg-neutral-100" />
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {r.product_name}
                        <span className="ml-2 text-xs text-neutral-500">taglia {r.size}</span>
                        {!r.product_id && (
                          <span className="ml-2 text-[10px] text-neutral-400 italic">
                            capo non più a catalogo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">{formatDate(r.created_at)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_PILL[st]}`}
                      >
                        {STATUS_LABEL[st]}
                      </span>
                      <select
                        value={st}
                        disabled={savingId === r.id}
                        onChange={(e) => changeStatus(r, e.target.value as RequestStatus)}
                        aria-label={`Stato della richiesta per ${r.product_name}`}
                        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
                      >
                        <option value="nuova">Nuova</option>
                        <option value="contattata">Contattata</option>
                        <option value="chiusa">Chiusa</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                    <span className="font-medium text-neutral-800">
                      {r.customer_name || "—"}
                    </span>
                    {r.customer_email && (
                      <a
                        href={`mailto:${r.customer_email}`}
                        className="inline-flex items-center gap-1.5 hover:text-emerald-700 transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        {r.customer_email}
                      </a>
                    )}
                    {r.phone && (
                      <a
                        href={`tel:${r.phone}`}
                        className="inline-flex items-center gap-1.5 hover:text-emerald-700 transition-colors"
                      >
                        <Phone className="w-3 h-3" />
                        {r.phone}
                      </a>
                    )}
                  </div>

                  {r.note && (
                    <p className="text-xs text-neutral-600 bg-neutral-50 rounded-xl px-3 py-2 whitespace-pre-wrap break-words">
                      {r.note}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
