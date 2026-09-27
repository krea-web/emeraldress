import { NextResponse, after, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  sendBrandedEmail,
  ADMIN_NOTIFICATION_EMAIL,
  brandLayout,
} from "@/lib/notification-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stessi parametri del checkout, sulla stessa tabella api_rate_limits.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;

const MAX_NOTE = 500;
const MAX_PHONE = 32;

function getClientIpHash(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  // Hash per privacy / GDPR (non salviamo l'IP in chiaro).
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

interface Payload {
  productId?: unknown;
  size?: unknown;
  phone?: unknown;
  note?: unknown;
}

/**
 * POST /api/availability-request
 *
 * Deposita nel gestionale la richiesta di disponibilità di un capo in vetrina.
 * L'inserimento passa di qui e non da un insert diretto dal browser, così la
 * validazione (capo esistente e in 'showcase', taglia fra quelle del capo) sta
 * sul server. La RLS resta la seconda barriera: si inserisce con la sessione
 * dell'utente, MAI con la service role.
 */
export async function POST(request: NextRequest) {
  // ── 1. Sessione: senza utente non si va avanti ──────────────────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Devi accedere per richiedere la disponibilità." },
      { status: 401 },
    );
  }

  // ── 2. Rate limit (stessa RPC del checkout) ─────────────────────────────
  const supabaseAdmin = createSupabaseAdminClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allowed, error: rlError } = await (supabaseAdmin as any).rpc("check_rate_limit", {
      p_ip_hash: getClientIpHash(request),
      p_route: "availability-request",
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
    });
    if (rlError) {
      console.warn("[/api/availability-request] rate limit check failed (fail-open):", rlError);
    } else if (allowed === false) {
      return NextResponse.json(
        { error: "Troppe richieste. Riprova tra un minuto." },
        { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) } },
      );
    }
  } catch (e) {
    console.warn("[/api/availability-request] rate limit exception (fail-open):", e);
  }

  // ── 3. Body ─────────────────────────────────────────────────────────────
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const size = typeof body.size === "string" ? body.size.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!productId) {
    return NextResponse.json({ error: "Capo non indicato" }, { status: 400 });
  }
  if (!size) {
    return NextResponse.json({ error: "Seleziona una taglia" }, { status: 400 });
  }
  if (phone.length > MAX_PHONE) {
    return NextResponse.json({ error: "Numero di telefono troppo lungo" }, { status: 400 });
  }
  if (note.length > MAX_NOTE) {
    return NextResponse.json(
      { error: `Le note non possono superare ${MAX_NOTE} caratteri` },
      { status: 400 },
    );
  }

  // ── 4. Il capo deve esistere ED essere in vetrina ───────────────────────
  // Bozza, capo attivo o id inventato: 400. Un capo attivo si compra dal
  // carrello, non si "richiede".
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, status, sizes")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    console.error("[/api/availability-request] lettura prodotto:", productError);
    return NextResponse.json({ error: "Errore lettura prodotto" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = product as any;
  if (!p || p.status !== "showcase") {
    return NextResponse.json({ error: "Capo non disponibile per la richiesta" }, { status: 400 });
  }

  // La taglia deve essere una di quelle in cui il capo esiste.
  const sizes: string[] = Array.isArray(p.sizes)
    ? p.sizes.filter((s: unknown): s is string => typeof s === "string")
    : [];
  if (!sizes.includes(size)) {
    return NextResponse.json({ error: "Taglia non valida per questo capo" }, { status: 400 });
  }

  // ── 5. Richiesta già aperta? Lo diciamo, invece di crearne un'altra ─────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("availability_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .eq("size", size)
    .eq("status", "nuova")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: "Hai già una richiesta aperta per questo capo in questa taglia. Ti contattiamo presto.",
        duplicate: true,
      },
      { status: 409 },
    );
  }

  // ── 6. Insert con la sessione dell'utente (RLS attiva) ──────────────────
  // customer_email e customer_name arrivano dalla sessione, non dal body:
  // il client non può spacciarsi per qualcun altro.
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const customerName =
    [metadata.first_name, metadata.last_name].filter(Boolean).join(" ").trim() ||
    (typeof metadata.full_name === "string" ? metadata.full_name : "") ||
    (typeof metadata.name === "string" ? metadata.name : "") ||
    null;

  // Cast a any: availability_requests non e' ancora nei tipi generati, stesso
  // workaround usato altrove nel progetto (collections, coupons, reviews).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (supabase as any)
    .from("availability_requests")
    .insert({
      user_id: user.id,
      product_id: p.id,
      product_name: String(p.name ?? "").trim() || "Capo",
      customer_email: user.email ?? null,
      customer_name: customerName,
      size,
      phone: phone || null,
      note: note || null,
      status: "nuova",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = l'indice unico parziale ha intercettato una seconda richiesta
    // arrivata nel frattempo (doppio click, due schede aperte).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((insertError as any).code === "23505") {
      return NextResponse.json(
        {
          error: "Hai già una richiesta aperta per questo capo in questa taglia. Ti contattiamo presto.",
          duplicate: true,
        },
        { status: 409 },
      );
    }
    console.error("[/api/availability-request] insert:", insertError);
    return NextResponse.json({ error: "Non siamo riusciti a registrare la richiesta" }, { status: 500 });
  }

  // ── 7. Avviso a Noemy: best effort, DOPO la risposta ────────────────────
  // La fonte di verità è la lista nell'admin. L'email è un di più e non deve
  // mai poter far fallire una richiesta: gira in `after()`, cioè fuori dal
  // percorso della risposta, con un timeout suo. Oggi il server n8n è giù:
  // se la richiesta dipendesse dall'email, non se ne salverebbe nessuna.
  after(async () => {
    try {
      const righe = [
        `<p><strong>${escapeHtml(String(p.name ?? "").trim())}</strong> — taglia <strong>${escapeHtml(size)}</strong></p>`,
        `<p>Cliente: ${escapeHtml(customerName ?? "—")} (${escapeHtml(user.email ?? "—")})</p>`,
        phone ? `<p>Telefono: ${escapeHtml(phone)}</p>` : "",
        note ? `<p>Note: ${escapeHtml(note)}</p>` : "",
      ].join("");

      await Promise.race([
        sendBrandedEmail({
          templateName: "availability_request",
          subject: `Nuova richiesta di disponibilità — ${String(p.name ?? "").trim()}`,
          html: brandLayout({
            title: "Nuova richiesta di disponibilità",
            body: righe,
            ctaUrl: "https://www.emeraldress.com/admin",
            ctaLabel: "Apri il gestionale",
          }),
          recipients: [{ email: ADMIN_NOTIFICATION_EMAIL, name: "Emeraldress" }],
        }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), 5000)),
      ]);
    } catch (e) {
      console.warn("[/api/availability-request] avviso email non inviato (non bloccante):", e);
    }
  });

  return NextResponse.json({ ok: true, id: inserted?.id ?? null }, { status: 201 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
