import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getStripe } from "@/lib/stripe";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shippingCostCents } from "@/lib/shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RESERVATION_TTL_SECONDS = 30 * 60; // 30 minuti

function getClientIpHash(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  // Hash per privacy / GDPR (non salviamo l'IP in chiaro).
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

interface CartLineRequest {
  productId: string;
  size: string;
  quantity: number;
}

interface CheckoutPayload {
  items: CartLineRequest[];
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.emeraldress.com";

export async function POST(request: NextRequest) {
  // ── Rate limiting (anti-DOS) ──────────────────────────────────────────
  const ipHash = getClientIpHash(request);
  const supabaseAdmin = createSupabaseAdminClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allowed, error: rlError } = await (supabaseAdmin as any).rpc("check_rate_limit", {
      p_ip_hash: ipHash,
      p_route: "checkout",
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
    });
    if (rlError) {
      // eslint-disable-next-line no-console
      console.warn("[/api/checkout] rate limit check failed (fail-open):", rlError);
    } else if (allowed === false) {
      return NextResponse.json(
        { error: "Troppe richieste. Riprova tra un minuto." },
        { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) } },
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/checkout] rate limit exception (fail-open):", e);
  }

  let body: CheckoutPayload;
  try {
    body = (await request.json()) as CheckoutPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Carrello vuoto" }, { status: 400 });
  }
  if (items.length > 20) {
    return NextResponse.json({ error: "Troppi articoli (max 20)" }, { status: 400 });
  }

  // Sanity sui campi
  for (const i of items) {
    if (
      typeof i.productId !== "string" ||
      typeof i.size !== "string" ||
      typeof i.quantity !== "number" ||
      !Number.isInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 10
    ) {
      return NextResponse.json({ error: "Item invalido" }, { status: 400 });
    }
  }

  // Fetch prezzi/stock dal DB (anon client, RLS pubblica)
  const supabase = createSupabasePublicClient();
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, slug, price, sale_price, images, stock_by_size, status")
    .in("id", productIds);

  if (error) {
    return NextResponse.json({ error: "Errore lettura prodotti" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>(((products as any[]) ?? []).map((p) => [p.id, p]));

  type LineItem = {
    productId: string;
    productName: string;
    size: string;
    unitAmountCents: number;
    quantity: number;
    image: string | null;
  };
  const validated: LineItem[] = [];

  // Aggrega qty per (productId, size) per validare contro lo stock totale per taglia
  const totalsByLine = new Map<string, number>();
  for (const i of items) {
    const k = `${i.productId}::${i.size}`;
    totalsByLine.set(k, (totalsByLine.get(k) ?? 0) + i.quantity);
  }

  for (const i of items) {
    const p = byId.get(i.productId);
    if (!p || p.status !== "active") {
      return NextResponse.json(
        { error: `Prodotto non disponibile: ${i.productId}` },
        { status: 400 },
      );
    }
    const unitPrice = Number(p.sale_price ?? p.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Prezzo prodotto non valido" }, { status: 400 });
    }

    const stockBySize = (p.stock_by_size ?? {}) as Record<string, number>;
    const stockForSize = Number(stockBySize[i.size] ?? 0);
    const requested = totalsByLine.get(`${i.productId}::${i.size}`) ?? i.quantity;
    if (requested > stockForSize) {
      return NextResponse.json(
        {
          error: `Stock insufficiente per ${p.name?.trim?.() ?? "il prodotto"} taglia ${i.size} (disponibili: ${stockForSize})`,
        },
        { status: 400 },
      );
    }

    const firstImage =
      Array.isArray(p.images) && typeof p.images[0] === "string" ? (p.images[0] as string) : null;

    validated.push({
      productId: p.id,
      productName: String(p.name ?? "Prodotto").trim(),
      size: i.size,
      unitAmountCents: Math.round(unitPrice * 100),
      quantity: i.quantity,
      image: firstImage,
    });
  }

  // ── Spedizione (decisa dal SERVER) ────────────────────────────────
  // Subtotale calcolato sulle righe già validate sopra (prezzi letti dal DB,
  // non dal client). shippingCostCents applica la soglia: sotto soglia si paga,
  // sopra soglia ritorna 0 e allora NON mandiamo nessuna shipping_option.
  // Mandare un rate da 0 € è esattamente il difetto che faceva spedire gratis
  // tutti: Stripe lo mostrava come voce scegliibile, e preselezionata.
  const subtotalCents = validated.reduce((acc, v) => acc + v.unitAmountCents * v.quantity, 0);
  const shippingCents = shippingCostCents(subtotalCents);

  // Build Stripe line_items
  const line_items = validated.map((v) => ({
    quantity: v.quantity,
    price_data: {
      currency: "eur",
      unit_amount: v.unitAmountCents,
      product_data: {
        name: `${v.productName} — Taglia ${v.size}`,
        ...(v.image ? { images: [v.image] } : {}),
        // metadata custom per il webhook → orders_items
        metadata: {
          emeraldress_product_id: v.productId,
          emeraldress_size: v.size,
        },
      },
    },
  }));

  // Metadata session-level: serializziamo l'intero cart compatto per il webhook.
  // Stripe metadata: max 500 chars per value, 50 keys. Comprimiamo aggressivamente.
  const compactCart = validated.map((v) => ({
    p: v.productId,
    s: v.size,
    q: v.quantity,
    a: v.unitAmountCents,
  }));
  const cartJson = JSON.stringify(compactCart);
  // Split su piu' chiavi se troppo lungo
  const metadata: Record<string, string> = {
    source: "cart",
    items_count: String(validated.reduce((acc, v) => acc + v.quantity, 0)),
  };
  if (cartJson.length <= 480) {
    metadata.cart = cartJson;
  } else {
    // chunk in cart_0..cart_n da 480 char ciascuno
    for (let idx = 0, off = 0; off < cartJson.length; idx++, off += 480) {
      metadata[`cart_${idx}`] = cartJson.slice(off, off + 480);
    }
    metadata.cart_chunks = String(Math.ceil(cartJson.length / 480));
  }

  // Recupera l'utente loggato (se presente) per associare la session via client_reference_id.
  // Lo userId serve al webhook per salvare lo shipping address in user_addresses.
  let authedUserId: string | null = null;
  try {
    const sbServer = await createSupabaseServerClient();
    const { data } = await sbServer.auth.getUser();
    authedUserId = data.user?.id ?? null;
  } catch {
    // Anonimo: ok, checkout guest.
  }

  // ── Reservation atomica (anti-oversell) ────────────────────────────────
  // Lock + check + insert in una transazione PostgreSQL. Se anche un solo item
  // non è disponibile (per stock o altre reservation attive), nessuna riga viene
  // scritta e Stripe non viene chiamato.
  const reserveItems = validated.map((v) => ({
    p: v.productId,
    s: v.size,
    q: v.quantity,
  }));
  // Serializzo p_items come stringa JSON: la function ora accetta `text` e
  // fa il cast a jsonb internamente (più robusto del param `jsonb` diretto,
  // che PostgREST a volte non castava correttamente).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reserveResult, error: reserveError } = await (supabaseAdmin as any).rpc(
    "reserve_cart",
    { p_items: JSON.stringify(reserveItems), p_ttl_seconds: RESERVATION_TTL_SECONDS },
  );
  if (reserveError) {
    // eslint-disable-next-line no-console
    console.error(
      "[/api/checkout] reserve_cart error:",
      JSON.stringify(reserveError, null, 2),
    );
    return NextResponse.json(
      { error: "Errore prenotazione stock", debug: reserveError.message ?? "rpc failed" },
      { status: 500 },
    );
  }
  if (reserveResult?.ok === false) {
    const firstMissing = Array.isArray(reserveResult.missing) ? reserveResult.missing[0] : null;
    const productName = firstMissing
      ? (byId.get(firstMissing.p)?.name?.trim?.() ?? "il prodotto")
      : "un prodotto";
    const available = firstMissing?.available ?? 0;
    const size = firstMissing?.s ?? "";
    return NextResponse.json(
      {
        error: `Stock non più disponibile per ${productName}${size ? ` taglia ${size}` : ""} (disponibili: ${available}). Aggiorna il carrello e riprova.`,
        missing: reserveResult.missing,
      },
      { status: 409 },
    );
  }
  const reservationIds: string[] = Array.isArray(reserveResult?.reservation_ids)
    ? reserveResult.reservation_ids
    : [];

  try {
    const stripe = getStripe();
    // Stripe minimum expires_at = now + 30 min, max = now + 24h. Allineato alla reservation.
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + RESERVATION_TTL_SECONDS;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // NOTA Klarna: era ["card", "klarna"] ma in alcuni account/scenari
      // (Klarna pending review, shipping_options con delivery_estimate,
      // descrizioni mancanti) Stripe rifiuta l'intera session. Per il drop
      // di domani teniamo solo card. Riabiliteremo Klarna dopo verifica
      // attivazione + eventuale rimozione di delivery_estimate.
      payment_method_types: ["card"],
      line_items,
      expires_at: sessionExpiresAt,
      success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/checkout/cancel`,
      ...(authedUserId ? { client_reference_id: authedUserId } : {}),
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["IT", "AT", "BE", "DE", "ES", "FR", "NL", "PT", "GB", "CH", "US"],
      },
      phone_number_collection: { enabled: true },
      locale: "it",
      // Spedizione: UNA sola opzione, già decisa sopra dal subtotale reale.
      // shippingCents === 0 → nessuna shipping_options del tutto (= gratis),
      // così Stripe non ha niente da far scegliere al cliente.
      ...(shippingCents > 0
        ? {
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount" as const,
                  fixed_amount: { amount: shippingCents, currency: "eur" },
                  display_name: "Spedizione standard",
                  delivery_estimate: {
                    minimum: { unit: "business_day" as const, value: 3 },
                    maximum: { unit: "business_day" as const, value: 5 },
                  },
                },
              },
            ],
          }
        : {}),
      allow_promotion_codes: true,
      metadata,
    });

    if (!session.url) {
      // Rilascia le reservation: la session non è andata a buon fine.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from("reservations")
        .update({ status: "released" })
        .in("id", reservationIds);
      return NextResponse.json({ error: "Sessione senza URL" }, { status: 500 });
    }

    // Linka le reservation alla session.id (così il webhook può consumarle/rilasciarle).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).rpc("link_reservations_to_session", {
      p_reservation_ids: reservationIds,
      p_stripe_session_id: session.id,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    // Stripe ha fallito → rilascia le reservation create poco fa.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from("reservations")
        .update({ status: "released" })
        .in("id", reservationIds);
    } catch {
      // best-effort, le reservation scadranno comunque
    }
    // eslint-disable-next-line no-console
    console.error("[/api/checkout] Stripe error:", e);
    const msg = e instanceof Error ? e.message : "Errore Stripe";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
