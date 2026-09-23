import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AbandonedItem {
  product_id?: string | null;
  slug?: string | null;
  name?: string | null;
  image?: string | null;
  size?: string | null;
  quantity?: number;
  unit_amount?: number;
}

// GET /api/cart-recovery?token=<recovery_token>
//
// Restituisce il carrello salvato per un abbandono Stripe, in formato pronto
// per essere caricato in CartContext (localStorage). Ricostruisce slug/image/
// prezzo CORRENTE dal DB (non quello al momento dell'abbandono — preferiamo
// info fresche cosi' se il prodotto e' cambiato l'utente vede stato attuale).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }
  try {
    const supabase = createSupabaseAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: abandoned } = await sb
      .from("abandoned_checkouts")
      .select("id, email, items, email_status, expired_at, converted_to_order_id")
      .eq("recovery_token", token)
      .maybeSingle();

    if (!abandoned) {
      return NextResponse.json({ error: "Recovery non trovato" }, { status: 404 });
    }
    // Gia' convertito: nulla da recuperare.
    if (abandoned.converted_to_order_id) {
      return NextResponse.json({ converted: true, items: [] });
    }

    const rawItems = Array.isArray(abandoned.items) ? (abandoned.items as AbandonedItem[]) : [];
    const productIds = Array.from(
      new Set(rawItems.map((i) => i.product_id).filter((x): x is string => typeof x === "string")),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products } = productIds.length
      ? await supabase
          .from("products")
          .select("id, slug, name, price, sale_price, images, stock_by_size, status")
          // NON uniformare a PUBLIC_PRODUCT_STATUSES: qui la regola e' piu'
          // stretta apposta. Questa non e' una vetrina, e' un carrello da
          // pagare: un capo in `showcase` verrebbe comunque rifiutato da
          // /api/checkout con un 400 a fine percorso (route.ts:125), quindi lo
          // si scarta a monte, esattamente come si fa gia' con lo stock
          // esaurito poco piu' sotto.
          .eq("status", "active")
          .in("id", productIds)
      : { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productMap = new Map<string, any>(((products as any[]) ?? []).map((p) => [p.id, p]));

    const cartItems = rawItems
      .map((it) => {
        if (!it.product_id) return null;
        const p = productMap.get(it.product_id);
        if (!p) return null;
        const images = Array.isArray(p.images)
          ? (p.images as unknown[]).flat(Infinity).filter((u): u is string => typeof u === "string")
          : [];
        const price = typeof p.sale_price === "number" && p.sale_price > 0 ? p.sale_price : p.price;
        const size = it.size ?? "";
        // Cap quantity al ricostruire — fino allo stock attuale per questa taglia
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sbs = ((p.stock_by_size ?? {}) as any) as Record<string, number>;
        const available = typeof sbs[size] === "number" ? sbs[size] : 0;
        const qty = Math.min(Math.max(1, it.quantity ?? 1), available || 0);
        if (qty <= 0) return null;
        return {
          lineId: `${p.id}::${size}`,
          productId: p.id,
          slug: p.slug ?? p.id,
          name: p.name,
          price,
          image: images[0] ?? "",
          size,
          quantity: qty,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json({
      converted: false,
      email: abandoned.email,
      items: cartItems,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[cart-recovery] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
