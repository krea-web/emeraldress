"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { ReturnsAdminSection } from "@/components/admin/ReturnsAdminSection";
import { CustomersAdminSection } from "@/components/admin/CustomersAdminSection";
import type { ProductStatus } from "@/lib/product-status";

// TECH DEBT: cast a any per workaround known issue @supabase/ssr generic inference.
// Sicurezza preservata: tutte le operazioni passano per RLS lato server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = getSupabaseBrowserClient() as any;
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Package, ShoppingBag, LogOut, Plus, X, Upload,
  TrendingUp, DollarSign, ChevronRight, Edit2, Trash2,
  Lock, GripVertical, ImageIcon, Mail, Download, Users, Archive, Send, Loader2,
  Code, Type, Layers, Settings, Palette, ScanSearch, Tag, Percent, Copy,
  BarChart3, MousePointerClick, RotateCcw, ExternalLink, AlertTriangle, Megaphone, Link as LinkIcon,
  Star, MessageSquare, Home, ArrowLeft, Menu, PackageCheck,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { FULL_HTML_TEMPLATES } from "@/data/emailTemplates";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  stock_by_size?: Record<string, number> | null;
  status: string;
  category: string;
  collection_id?: string | null;
  images: string[];
  sizes: string[] | null;
  fabric_details: string | null;
  shipping_info: string | null;
  created_at: string;
  stripe_payment_link?: string | null;
}

interface Order {
  id: string;
  customer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  items?: any;
  tracking_number?: string;
  tracking_url?: string;
  return_status?: string;
  return_label_url?: string;
}

interface Subscriber {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string | null;
  active: boolean;
  created_at: string;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

type AdminSection = "dashboard" | "analytics" | "products" | "orders" | "returns" | "clients" | "reviews" | "newsletter" | "collections" | "settings" | "scanner" | "marketing" | "email_templates";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

// ── Sales chart mock data helper ───────────────────────────────────────────────
function buildChartData(orders: Order[]) {
  const map: Record<string, number> = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    map[d.toISOString().slice(0, 10)] = 0;
  }
  orders.forEach((o) => {
    const day = o.created_at.slice(0, 10);
    if (day in map) map[day] = (map[day] || 0) + Number(o.total_amount);
  });
  return Object.entries(map).map(([date, revenue]) => ({
    date: date.slice(5),
    revenue,
  }));
}

// ── Image item for multi-upload ────────────────────────────────────────────────
interface ImageItem {
  id: string;          // unique key
  url: string;         // object URL (new) or remote URL (existing)
  file?: File;         // only for new files
  isNew: boolean;
}

// ── Empty product form ─────────────────────────────────────────────────────────
// Stati prodotto: etichette e pillole condivise fra tabella e drawer.
const STATUS_LABEL: Record<ProductStatus, string> = {
  active: "Attivo",
  showcase: "Vetrina",
  draft: "Bozza",
};

// Pillole coerenti con il resto della tabella: verde / ambra / neutro.
const STATUS_PILL: Record<ProductStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  showcase: "bg-amber-50 text-amber-700",
  draft: "bg-neutral-100 text-neutral-500",
};

/**
 * Normalizza qualunque stringa arrivi dal DB a uno dei tre stati validi.
 * Senza questo, riaprendo la scheda di un capo in vetrina lo stato veniva
 * schiacciato su "active" e la vetrina si perdeva al primo salvataggio.
 */
function normalizeStatus(value: string | null | undefined): ProductStatus {
  return value === "draft" || value === "showcase" ? value : "active";
}

const emptyForm = {
  name: "",
  description: "",
  price: "",
  sale_price: "",
  stock: "0",
  category: "classics",
  collection_id: "",
  fabric_details: "",
  shipping_info: "",
  sizes: "XS/S,S/M,M/L",
  status: "active" as ProductStatus,
  stripe_payment_link: "",
  // stockMap: chiave = taglia (es. "XS/S"), valore = quantita' (string per Input).
  // Sincronizzato con `sizes` quando l'admin modifica la lista taglie.
  stockMap: { "XS/S": "0", "S/M": "0", "M/L": "0" } as Record<string, string>,
};

// Utility: parse "XS, S, M-L" -> ["XS","S","M-L"], split solo su virgola.
function parseSizesInput(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════════════
export function AdminClient() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "not-admin" | "admin">("loading");
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [chartData, setChartData] = useState<{ date: string; revenue: number }[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // order detail & shipping
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [shippingForm, setShippingForm] = useState({ tracking_number: "", tracking_url: "" });
  const [shippingSaving, setShippingSaving] = useState(false);

  // collection form
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [collectionForm, setCollectionForm] = useState({ name: "", description: "", is_active: true });
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  // site settings
  const [settingsTab, setSettingsTab] = useState<"texts" | "images" | "branding" | "seo" | "banner">("texts");
  const [promoBanner, setPromoBanner] = useState({ is_active: false, text: "", link: "", bg_color: "#065f46", text_color: "#ffffff" });
  const [seoSettings, setSeoSettings] = useState<Record<string, string>>({ meta_title: "", meta_description: "", og_image_url: "" });
  const [seoUploading, setSeoUploading] = useState(false);
  const [pageContent, setPageContent] = useState<Record<string, string>>({});
  const [pageImages, setPageImages] = useState<Record<string, string>>({});
  const [branding, setBranding] = useState<Record<string, string>>({ primary_color: "#004d40", secondary_color: "#a7f3d0" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const settingsFileRef = useRef<HTMLInputElement>(null);
  const [settingsUploadingKey, setSettingsUploadingKey] = useState<string | null>(null);

  // scanner hub
  interface ScannerRequest {
    id: string;
    image_url: string | null;
    input_type: string;
    diagnosis_result: any;
    sustainability_score: number | null;
    material: string | null;
    brand: string | null;
    garment_type: string | null;
    created_at: string;
  }
  const [scannerRequests, setScannerRequests] = useState<ScannerRequest[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScannerRequest | null>(null);

  // coupons
  interface Coupon {
    id: string;
    code: string;
    discount_type: "percentage" | "fixed";
    value: number;
    is_active: boolean;
    valid_until: string | null;
    usage_limit: number | null;
    used_count: number;
  }
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponDrawerOpen, setCouponDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: "", discount_type: "percentage" as "percentage" | "fixed", value: "", is_active: true, valid_until: "", usage_limit: "",
  });
  const [couponSubmitting, setCouponSubmitting] = useState(false);

  // reviews
  interface Review {
    id: string;
    product_id: string;
    customer_name: string;
    rating: number;
    comment: string | null;
    is_approved: boolean;
    created_at: string;
    product_name?: string;
    photo_urls?: string[] | null;
  }
  const [reviews, setReviews] = useState<Review[]>([]);

  // email templates
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [etEditing, setEtEditing] = useState<EmailTemplate | null>(null);
  const [etForm, setEtForm] = useState({ name: "", subject: "", body_html: "" });
  const [etSaving, setEtSaving] = useState(false);
  const [etShowEditor, setEtShowEditor] = useState(false);
  const [etEditorMode, setEtEditorMode] = useState<"visual" | "html">("visual");
  const etQuillRef = useRef<any>(null);

  // product drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);

  // newsletter campaign
  const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [editorMode, setEditorMode] = useState<"richtext" | "html">("richtext");
  const [isFullHtmlTemplate, setIsFullHtmlTemplate] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>(""); // datetime-local format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recentSends, setRecentSends] = useState<any[]>([]);

  const quillModules = useMemo(() => ({
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "image"],
      ["clean"],
    ],
  }), []);

  // ── Auth check ───────────────────────────────────────────────────────────────
  async function checkAdmin(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (error) {
        // Network/RLS error: don't downgrade an already-admin state.
        console.warn("[Admin] role check error:", error);
        setAuthState((s) => (s === "admin" ? s : "not-admin"));
        return;
      }
      if (data) {
        setAuthState("admin");
        fetchAll();
      } else {
        setAuthState((s) => (s === "admin" ? s : "not-admin"));
      }
    } catch (e) {
      console.warn("[Admin] role check failed:", e);
      setAuthState((s) => (s === "admin" ? s : "not-admin"));
    }
  }

  useEffect(() => {
    let settled = false;
    // Hard safety: never leave the admin page on the loader for more than 6s.
    const safety = setTimeout(() => {
      if (settled) return;
      setAuthState((s) => (s === "loading" ? "unauthenticated" : s));
    }, 6000);

    supabase.auth.getSession()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data: { session } }: { data: { session: any } }) => {
        settled = true;
        clearTimeout(safety);
        if (!session) setAuthState((s) => (s === "admin" ? s : "unauthenticated"));
        else checkAdmin(session.user.id);
      })
      .catch((e: unknown) => {
        settled = true;
        clearTimeout(safety);
        console.warn("[Admin] getSession failed:", e);
        setAuthState((s) => (s === "admin" ? s : "unauthenticated"));
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      // Ignore noisy events that don't change identity. Re-checking the role
      // on every TOKEN_REFRESHED can flap the state away from "admin".
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      if (event === "SIGNED_OUT" || !session) {
        setAuthState("unauthenticated");
        return;
      }
      // SIGNED_IN / INITIAL_SESSION with a session
      setTimeout(() => checkAdmin(session.user.id), 0);
    });
    return () => {
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      setLoginError(`Errore: ${error.message}`);
    }
    setLoginLoading(false);
  }

  // ── Data fetching ────────────────────────────────────────────────────────────
  // Helper: race fetchAll contro un timeout 10s. Se anche solo una query
  // resta appesa (Supabase cold start, rete instabile), evitiamo loader
  // infinito mostrando un errore esplicito.
  function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} > ${ms / 1000}s`)), ms),
      ),
    ]);
  }

  // Detect 401 / session expired error da Supabase + redirect auto
  function isSessionExpiredError(err: unknown): boolean {
    if (!err) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const code = e?.code ?? e?.status;
    const msg = String(e?.message ?? "").toLowerCase();
    return (
      code === 401 ||
      code === "PGRST301" ||
      msg.includes("jwt") ||
      msg.includes("session") ||
      msg.includes("expired") ||
      msg.includes("invalid refresh token")
    );
  }

  async function fetchAll() {
    try {
      const [
      { data: prods, error: prodsError },
      { data: ords, error: ordsError },
      { data: subs, error: subscribersError },
      { data: cols, error: colsError },
      { data: settingsRows, error: settingsError },
      { data: scans, error: scansError },
      { data: cpns, error: cpnsError },
      { data: ets, error: etsError },
      { data: revs, error: revsError },
    ] = await withTimeout(
      Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("subscribers").select("*"),
      supabase.from("collections" as any).select("*").order("name"),
      supabase.from("app_settings" as any).select("*").eq("id", 1).maybeSingle(),
      supabase.from("scanner_requests").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("coupons" as any).select("*").order("code"),
      supabase.from("email_templates" as any).select("*").order("updated_at", { ascending: false }),
      supabase.from("reviews" as any).select("*").order("created_at", { ascending: false }),
    ]),
      10_000,
      "fetchAll",
    );

    // Detect sessione scaduta da una qualsiasi delle query → redirect login
    const firstSessionExpired = [
      prodsError, ordsError, subscribersError, colsError, settingsError,
      scansError, cpnsError, etsError, revsError,
    ].find(isSessionExpiredError);
    if (firstSessionExpired) {
      // eslint-disable-next-line no-console
      console.warn("[admin] sessione scaduta, redirect a /login", firstSessionExpired);
      toast.error("Sessione scaduta. Effettua di nuovo l'accesso.");
      setTimeout(() => {
        window.location.href = "/login?redirectTo=/admin&error=session_expired";
      }, 1500);
      return;
    }

    if (prodsError) toast.error("Errore nel caricamento prodotti");
    if (ordsError) toast.error("Errore nel caricamento ordini");
    if (subscribersError) toast.error("Errore nel caricamento iscritti newsletter");
    if (settingsError) toast.error("Errore nel caricamento impostazioni");
    if (scansError) toast.error("Errore nel caricamento scansioni");
    if (cpnsError) toast.error("Errore nel caricamento coupon");
    if (etsError) toast.error("Errore nel caricamento template email");

    const prodList = (prods as Product[]) || [];
    setProducts(prodList);
    // orders schema migrated: map guest_email -> customer_email and load items from order_items if present
    const ordList: Order[] = ((ords as any[]) || []).map((o) => ({
      id: o.id,
      customer_email: o.guest_email ?? o.customer_email ?? "",
      total_amount: Number(o.total_amount ?? 0),
      status: o.status ?? "pending",
      created_at: o.created_at,
      items: o.items ?? [],
      tracking_number: o.tracking_number ?? undefined,
      tracking_url: o.tracking_url ?? undefined,
      return_status: o.return_status ?? undefined,
      return_label_url: o.return_label_url ?? undefined,
    }));
    setOrders(ordList);
    setChartData(buildChartData(ordList));
    setSubscribers((subs as Subscriber[]) || []);
    setCollections((cols as unknown as Collection[]) || []);

    if (settingsRows) {
      const s = settingsRows as any;
      if (s.page_content) setPageContent(s.page_content);
      if (s.page_images) setPageImages(s.page_images);
      if (s.branding) setBranding(s.branding);
      if (s.seo_settings) setSeoSettings(s.seo_settings);
      if (s.promo_banner) setPromoBanner(s.promo_banner);
    }
    setScannerRequests((scans as unknown as ScannerRequest[]) || []);
    setCoupons((cpns as unknown as Coupon[]) || []);
    setEmailTemplates((ets as unknown as EmailTemplate[]) || []);

    // Map reviews with product names
    const reviewsList = ((revs as unknown as Review[]) || []).map((r) => ({
      ...r,
      product_name: prodList.find((p) => p.id === r.product_id)?.name || "Prodotto rimosso",
    }));
    setReviews(reviewsList);

    // Carica history invii newsletter
    await loadRecentSends();
    } catch (err) {
      // Timeout o errore network: l'utente vede comunque l'admin con dati
      // parziali (se primo load) o stantii (se refresh). Mostriamo toast.
      // eslint-disable-next-line no-console
      console.warn("[admin] fetchAll error:", err);
      if (isSessionExpiredError(err)) {
        toast.error("Sessione scaduta. Effettua di nuovo l'accesso.");
        setTimeout(() => {
          window.location.href = "/login?redirectTo=/admin&error=session_expired";
        }, 1500);
        return;
      }
      const msg = err instanceof Error ? err.message : "Errore caricamento dati";
      toast.error("Errore caricamento dashboard", {
        description: msg.includes("Timeout")
          ? "Connessione lenta. Ricarica per riprovare."
          : msg,
      });
    }
  }

  // ── Newsletter helpers ──────────────────────────────────────────────────────
  const activeSubscribers = subscribers.filter((s) => s.active);

  function exportCSV() {
    const header = "Nome,Email,Telefono,Fonte,Attivo,Data Iscrizione\n";
    const rows = subscribers.map((s) =>
      [s.name || "", s.email, s.phone || "", s.source || "", s.active ? "Sì" : "No", new Date(s.created_at).toLocaleDateString("it-IT")].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSubscriber(email: string) {
    setSelectedSubscribers((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  function toggleAllSubscribers() {
    if (selectedSubscribers.length === activeSubscribers.length) {
      setSelectedSubscribers([]);
    } else {
      setSelectedSubscribers(activeSubscribers.map((s) => s.email));
    }
  }

  function generateFinalHTML(bodyContent: string) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:#004d40;padding:32px 24px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:3px;">EMERALDRESS</h1>
</td></tr>
<tr><td style="background:#ffffff;padding:32px 24px;">
${bodyContent}
</td></tr>
<tr><td style="background:#f9f9f9;padding:24px;text-align:center;">
<p style="margin:0;font-size:12px;color:#999;">© ${new Date().getFullYear()} Emeraldress — Lusso Consapevole</p>
</td></tr>
</table></td></tr></table></body></html>`;
  }

  function handleTemplateChange(template: string) {
    setSelectedTemplate(template);
    const fullHtml = FULL_HTML_TEMPLATES[template];
    if (fullHtml) {
      setEmailSubject(fullHtml.subject);
      setEmailBody(fullHtml.html);
      setIsFullHtmlTemplate(true);
      setEditorMode("html");
    } else if (template === "launch") {
      setEmailSubject("È arrivato il momento — Scopri la nuova collezione");
      setEmailBody("<p>Cara amica dello stile,</p><p>Il giorno è arrivato. La nostra nuova collezione è finalmente disponibile.</p><p>Ogni capo è realizzato con materiali rigenerati ECONYL® e manifattura artigianale italiana.</p><p><a href='https://www.emeraldress.com/collezioni' style='color:#004d40;font-weight:bold;'>Scopri la Collezione →</a></p><p>Con stile,<br/>Il Team Emeraldress</p>");
      setIsFullHtmlTemplate(false);
    } else {
      setEmailSubject("");
      setEmailBody("");
      setIsFullHtmlTemplate(false);
    }
  }

  async function handleSaveShipping() {
    if (!selectedOrder) return;
    if (!shippingForm.tracking_number) {
      toast.error("Tracking number obbligatorio");
      return;
    }
    setShippingSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_tracking",
          tracking_number: shippingForm.tracking_number,
          tracking_url: shippingForm.tracking_url || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Salvataggio fallito");

      setSelectedOrder({
        ...selectedOrder,
        tracking_number: shippingForm.tracking_number,
        tracking_url: shippingForm.tracking_url,
        status: "shipped",
      });
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? {
                ...o,
                tracking_number: shippingForm.tracking_number,
                tracking_url: shippingForm.tracking_url,
                status: "shipped",
              }
            : o,
        ),
      );
      toast.success("Tracking salvato. Email cliente inviata.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error("Errore: " + (err.message || "Salvataggio fallito"));
    } finally {
      setShippingSaving(false);
    }
  }

  async function handleMarkDelivered() {
    if (!selectedOrder) return;
    if (selectedOrder.status !== "shipped") {
      toast.error("L'ordine non è ancora stato spedito.");
      return;
    }
    if (!confirm("Confermi la consegna? Il cliente riceverà email di notifica.")) return;
    setShippingSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_delivered" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore");

      setSelectedOrder({ ...selectedOrder, status: "delivered" });
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: "delivered" } : o)),
      );
      toast.success("Ordine marcato come consegnato. Email cliente inviata.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error("Errore: " + (err.message || "Operazione fallita"));
    } finally {
      setShippingSaving(false);
    }
  }

  async function handleSendNewsletter() {
    const tpl = emailTemplates.find((t) => t.id === selectedTemplate);
    if (!tpl || selectedSubscribers.length === 0) return;
    setSending(true);
    try {
      const recipients = subscribers
        .filter((s) => selectedSubscribers.includes(s.email))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => ({
          email: s.email,
          name: s.name || "",
          token: s.token || "",
        }));
      const htmlContent =
        tpl.body_html.trim().toLowerCase().startsWith("<!doctype") ||
        tpl.body_html.trim().toLowerCase().startsWith("<html")
          ? tpl.body_html
          : generateFinalHTML(tpl.body_html);

      // Se schedulato in futuro → il WF n8n metterà in coda con Wait Until. Se vuoto → invio immediato.
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const campaignId = crypto.randomUUID();

      // WF EMERALD-Email-Send: il WF gestisce dedup atomico (email_campaigns lock),
      // INSERT email_log status='pending' poi UPDATE 'sent'/'failed'.
      // NON facciamo pre-INSERT lato sito per evitare race condition col WF lock.
      // URL hardcoded: il vecchio /webhook/email-send e' stato disattivato dall'agente n8n.
      const webhookUrl =
        "https://n8n.kreareweb.com/webhook/emerald/email-send-b2a4d6f8c0e2a4b6d8f0c2e4a6b8d0f2";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          template_name: tpl.name,
          subject: tpl.subject,
          html: htmlContent,
          recipients,
          scheduled_at: scheduledIso,
        }),
      });
      if (!res.ok) throw new Error(`Errore webhook: ${res.status}`);

      const when = scheduledIso
        ? `schedulata per ${new Date(scheduledIso).toLocaleString("it-IT")}`
        : `in invio ora`;
      toast.success(`Campagna ${when} (${recipients.length} destinatari) — vedi storico per stato.`);
      setSelectedSubscribers([]);
      setSelectedTemplate("");
      setScheduledAt("");

      // Ricarica history (potrebbe non avere ancora righe se il WF e' in Wait Until)
      setTimeout(() => loadRecentSends(), 2000);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore durante l'invio");
    } finally {
      setSending(false);
    }
  }

  async function loadRecentSends() {
    const { data } = await supabase
      .from("email_log")
      .select("id, email_type, recipient, sent_at, status, campaign_id")
      .order("sent_at", { ascending: false })
      .limit(50);
    setRecentSends((data ?? []) as unknown as typeof recentSends);
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);

  // analytics
  const [visitsToday, setVisitsToday] = useState(0);
  const [uniqueVisitors, setUniqueVisitors] = useState(0);

  useEffect(() => {
    if (authState !== "admin") return;
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("site_analytics" as any)
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);
      setVisitsToday(count || 0);

      const { data: allRows } = await supabase
        .from("site_analytics" as any)
        .select("visitor_id");
      if (allRows) {
        const unique = new Set((allRows as any[]).map((r: any) => r.visitor_id));
        setUniqueVisitors(unique.size);
      }
    })();
  }, [authState]);

  // ── Reservations live (clienti in checkout adesso) ──────────────────────
  const [activeReservations, setActiveReservations] = useState(0);
  useEffect(() => {
    if (authState !== "admin") return;
    let cancelled = false;
    const refresh = async () => {
      const { count } = await supabase
        .from("reservations" as any)
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      if (!cancelled) setActiveReservations(count ?? 0);
    };
    void refresh();
    const channel = supabase
      .channel("admin-reservations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authState]);

  // ── Realtime subscription: nuovi ordini live ─────────────────────────────
  // Quando il webhook Stripe (Vercel) crea un ordine, l'INSERT è inviato in
  // tempo reale all'admin via WebSocket. Niente refresh, ordine in cima alla
  // lista con badge "🆕" animato per 8 secondi + toast notification.
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (authState !== "admin") return;
    const channel = supabase
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const o = payload.new;
          if (!o) return;
          const newOrder: Order = {
            id: o.id,
            customer_email: o.customer_email ?? o.guest_email ?? "",
            total_amount: Number(o.total_amount ?? 0),
            status: o.status ?? "pending",
            created_at: o.created_at,
            items: [],
            tracking_number: o.tracking_number ?? undefined,
            tracking_url: o.tracking_url ?? undefined,
            return_status: o.return_status ?? undefined,
          };
          // Prepend nuovo ordine (no duplicati)
          setOrders((prev) => {
            if (prev.some((p) => p.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
          // Mark "fresh" per 8 secondi → badge animato
          setNewOrderIds((prev) => new Set(prev).add(newOrder.id));
          setTimeout(() => {
            setNewOrderIds((prev) => {
              const next = new Set(prev);
              next.delete(newOrder.id);
              return next;
            });
          }, 8000);
          // Toast
          const orderNum =
            (o.order_number as string | undefined) ?? newOrder.id.slice(0, 8);
          toast.success(`🆕 Nuovo ordine ${orderNum}`, {
            description: `${newOrder.customer_email} · €${newOrder.total_amount.toFixed(2)}`,
            duration: 6000,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authState]);

  // ── Image helpers ─────────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: ImageItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      url: URL.createObjectURL(file),
      file,
      isNew: true,
    }));
    setImageItems((prev) => [...prev, ...newItems]);
  }, []);

  const removeImage = (id: string) => {
    setImageItems((prev) => prev.filter((img) => img.id !== id));
  };

  const handleDragStart = (index: number) => { dragIndexRef.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setImageItems((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(index, 0, item);
      dragIndexRef.current = index;
      return arr;
    });
  };

  // ── Product CRUD ─────────────────────────────────────────────────────────────
  function openNewProduct() {
    setEditingProduct(null);
    setForm({ ...emptyForm });
    setImageItems([]);
    setDrawerOpen(true);
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p);
    const sbs = p.stock_by_size ?? {};
    const productSizes = (p.sizes || []).filter(Boolean);
    // stockMap: per ogni taglia del prodotto, prendi lo stock dal DB (0 default).
    // Includi anche eventuali chiavi residue in stock_by_size non piu' in sizes
    // cosi' l'admin le vede e puo' azzerarle/rimuoverle.
    const stockMap: Record<string, string> = {};
    productSizes.forEach((s) => {
      stockMap[s] = String(sbs[s] ?? 0);
    });
    Object.keys(sbs).forEach((k) => {
      if (!(k in stockMap)) stockMap[k] = String(sbs[k] ?? 0);
    });
    setForm({
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      sale_price: p.sale_price ? String(p.sale_price) : "",
      stock: String(p.stock ?? 0),
      category: p.category,
      collection_id: p.collection_id || "",
      fabric_details: p.fabric_details || "",
      shipping_info: p.shipping_info || "",
      sizes: productSizes.join(","),
      // normalizeStatus, non il vecchio ternario: con tre stati,
      // `p.status === "draft" ? "draft" : "active"` avrebbe riportato
      // ogni capo in vetrina ad "attivo" a ogni riapertura della scheda.
      status: normalizeStatus(p.status),
      stripe_payment_link: p.stripe_payment_link || "",
      stockMap,
    });
    // Flatten in case DB has nested arrays like [["url"]] instead of ["url"]
    const flatImages: string[] = (p.images || [])
      .flat(Infinity)
      .filter((u): u is string => typeof u === "string");
    setImageItems(flatImages.map((url) => ({
      id: url,
      url,
      isNew: false,
    })));
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.price) {
      toast.error("Nome e prezzo sono obbligatori");
      return;
    }
    setSubmitting(true);
    try {
      const finalUrls: string[] = [];
      for (const item of imageItems) {
        if (item.isNew && item.file) {
          const ext = item.file.name.split(".").pop();
          const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(path, item.file, { upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage
            .from("product-images")
            .getPublicUrl(path);
          finalUrls.push(publicUrl);
        } else {
          finalUrls.push(item.url);
        }
      }

      const sizesArray: string[] = parseSizesInput(form.sizes);

      // stockBySize: solo per le taglie presenti nella lista corrente.
      // Eventuali chiavi obsolete vengono droppate (cosi' il trigger ricalcola
      // correttamente lo stock totale).
      const stockBySize: Record<string, number> = {};
      sizesArray.forEach((s) => {
        stockBySize[s] = parseInt(form.stockMap[s] ?? "0") || 0;
      });

      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
        // `stock` totale è auto-sincronizzato dal trigger DB (somma stock_by_size).
        // Non lo passiamo qui: lo lascia gestire al trigger per evitare drift.
        stock_by_size: stockBySize,
        category: form.category,
        collection_id: form.collection_id || null,
        fabric_details: form.fabric_details || null,
        shipping_info: form.shipping_info || null,
        sizes: sizesArray,
        status: form.status,
        images: finalUrls,
        stripe_payment_link: form.stripe_payment_link || null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(payload as any)
          .eq("id", editingProduct.id);
        if (error) throw error;
        toast.success("Prodotto aggiornato");
      } else {
        const { error } = await supabase.from("products").insert(payload as any);
        if (error) throw error;
        toast.success("Prodotto creato");
      }

      setDrawerOpen(false);
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Eliminare questo prodotto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Prodotto eliminato");
    fetchAll();
  }

  /**
   * Con tre stati un interruttore binario è ambiguo: si passa lo stato
   * desiderato in modo esplicito.
   */
  async function setProductStatus(p: Product, next: ProductStatus) {
    if (normalizeStatus(p.status) === next) return;
    const { error } = await supabase.from("products").update({ status: next }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${p.name.trim()} → ${STATUS_LABEL[next]}`);
    fetchAll();
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    router.push("/");
  }

  // ── Loading / auth guard ─────────────────────────────────────────────────────
  // The iPad frame handles all states (loading, login, not-admin, admin)
  // so we don't early-return here.

  // ── Collections CRUD ──────────────────────────────────────────────────────────
  function openNewCollection() {
    setEditingCollection(null);
    setCollectionForm({ name: "", description: "", is_active: true });
    setCollectionDrawerOpen(true);
  }

  function openEditCollection(c: Collection) {
    setEditingCollection(c);
    setCollectionForm({ name: c.name, description: c.description || "", is_active: c.is_active });
    setCollectionDrawerOpen(true);
  }

  async function handleCollectionSubmit() {
    if (!collectionForm.name) { toast.error("Il nome è obbligatorio"); return; }
    setCollectionSubmitting(true);
    try {
      const payload = {
        name: collectionForm.name,
        description: collectionForm.description || null,
        is_active: collectionForm.is_active,
      };
      if (editingCollection) {
        const { error } = await supabase.from("collections" as any).update(payload as any).eq("id", editingCollection.id);
        if (error) throw error;
        toast.success("Collezione aggiornata");
      } else {
        const { error } = await supabase.from("collections" as any).insert(payload as any);
        if (error) throw error;
        toast.success("Collezione creata");
      }
      setCollectionDrawerOpen(false);
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setCollectionSubmitting(false);
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm("Eliminare questa collezione?")) return;
    const { error } = await supabase.from("collections" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Collezione eliminata");
    fetchAll();
  }

  // ── Settings helpers ──────────────────────────────────────────────────────────
  async function saveSettings() {
    setSettingsSaving(true);
    try {
      const { error } = await supabase.from("app_settings" as any).upsert({
        id: 1,
        page_content: pageContent,
        page_images: pageImages,
        branding,
        seo_settings: seoSettings,
        promo_banner: promoBanner,
      } as any);
      if (error) throw error;
      toast.success("Impostazioni salvate");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore nel salvataggio");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSettingsImageUpload(key: string, file: File) {
    setSettingsUploadingKey(key);
    try {
      const ext = file.name.split(".").pop();
      const path = `site/${key}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("emerald-asset")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from("emerald-asset")
        .getPublicUrl(path);
      setPageImages((prev) => ({ ...prev, [key]: publicUrl }));
      toast.success(`Immagine "${key}" caricata`);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore upload");
    } finally {
      setSettingsUploadingKey(null);
    }
  }

  // ── Email Template CRUD ────────────────────────────────────────────────────
  function openNewTemplate() {
    setEtEditing(null);
    setEtForm({ name: "", subject: "", body_html: "" });
    setEtShowEditor(true);
  }
  function openEditTemplate(t: EmailTemplate) {
    setEtEditing(t);
    setEtForm({ name: t.name, subject: t.subject, body_html: t.body_html });
    setEtShowEditor(true);
  }
  async function handleSaveTemplate() {
    if (!etForm.name.trim()) { toast.error("Inserisci un nome per il template"); return; }
    setEtSaving(true);
    try {
      if (etEditing) {
        const { error } = await supabase.from("email_templates" as any).update({
          name: etForm.name, subject: etForm.subject, body_html: etForm.body_html, updated_at: new Date().toISOString(),
        } as any).eq("id", etEditing.id);
        if (error) throw error;
        toast.success("Template aggiornato");
      } else {
        const { error } = await supabase.from("email_templates" as any).insert({
          name: etForm.name, subject: etForm.subject, body_html: etForm.body_html,
        } as any);
        if (error) throw error;
        toast.success("Template creato");
      }
      setEtShowEditor(false);
      fetchAll();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setEtSaving(false); }
  }
  async function deleteTemplate(id: string) {
    if (!confirm("Eliminare questo template?")) return;
    const { error } = await supabase.from("email_templates" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template eliminato");
    fetchAll();
  }
  function insertVariableIntoEditor(variable: string) {
    setEtForm((prev) => ({ ...prev, body_html: prev.body_html + variable }));
  }

  // ── Coupon CRUD ──────────────────────────────────────────────────────────────
  function generateCouponCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "EM-";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function openNewCoupon() {
    setEditingCoupon(null);
    setCouponForm({ code: generateCouponCode(), discount_type: "percentage", value: "", is_active: true, valid_until: "", usage_limit: "" });
    setCouponDrawerOpen(true);
  }

  function openEditCoupon(c: Coupon) {
    setEditingCoupon(c);
    setCouponForm({
      code: c.code,
      discount_type: c.discount_type,
      value: String(c.value),
      is_active: c.is_active,
      valid_until: c.valid_until ? c.valid_until.slice(0, 10) : "",
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
    });
    setCouponDrawerOpen(true);
  }

  async function handleCouponSubmit() {
    if (!couponForm.code || !couponForm.value) { toast.error("Codice e valore sono obbligatori"); return; }
    setCouponSubmitting(true);
    try {
      const payload = {
        code: couponForm.code.toUpperCase(),
        discount_type: couponForm.discount_type,
        value: parseFloat(couponForm.value),
        is_active: couponForm.is_active,
        valid_until: couponForm.valid_until || null,
        usage_limit: couponForm.usage_limit ? parseInt(couponForm.usage_limit) : null,
      };
      if (editingCoupon) {
        const { error } = await supabase.from("coupons" as any).update(payload as any).eq("id", editingCoupon.id);
        if (error) throw error;
        toast.success("Coupon aggiornato");
      } else {
        const { error } = await supabase.from("coupons" as any).insert(payload as any);
        if (error) throw error;
        toast.success("Coupon creato");
      }
      setCouponDrawerOpen(false);
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setCouponSubmitting(false);
    }
  }

  async function deleteCoupon(id: string) {
    if (!confirm("Eliminare questo coupon?")) return;
    const { error } = await supabase.from("coupons" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Coupon eliminato");
    fetchAll();
  }

  async function toggleCouponActive(c: Coupon) {
    const { error } = await supabase.from("coupons" as any).update({ is_active: !c.is_active } as any).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  }

  // ── Sidebar nav items ────────────────────────────────────────────────────────
  const nav = [
    { id: "dashboard" as AdminSection, icon: LayoutDashboard, label: "Dashboard" },
    { id: "analytics" as AdminSection, icon: BarChart3, label: "Analytics" },
    { id: "collections" as AdminSection, icon: Layers, label: "Collezioni" },
    { id: "products" as AdminSection, icon: Package, label: "Prodotti" },
    { id: "orders" as AdminSection, icon: ShoppingBag, label: "Ordini" },
    { id: "returns" as AdminSection, icon: RotateCcw, label: "Resi" },
    { id: "clients" as AdminSection, icon: Users, label: "Clienti" },
    { id: "reviews" as AdminSection, icon: MessageSquare, label: "Recensioni" },
    { id: "marketing" as AdminSection, icon: Tag, label: "Marketing" },
    { id: "newsletter" as AdminSection, icon: Mail, label: "Newsletter" },
    { id: "email_templates" as AdminSection, icon: Code, label: "Template Email" },
    { id: "scanner" as AdminSection, icon: ScanSearch, label: "Scanner" },
    { id: "settings" as AdminSection, icon: Settings, label: "Impostazioni" },
  ];

  // Mobile nav helper
  const handleMobileNav = (id: AdminSection) => {
    setSection(id);
    setMobileMenuOpen(false);
  };

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    shipped: "bg-emerald-100 text-emerald-800",
    delivered: "bg-emerald-200 text-emerald-900",
    cancelled: "bg-red-100 text-red-800",
  };

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <>
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-50 flex flex-col" style={{ fontFamily: "var(--font-sans)" }}>
      {/* ── Mobile Header ── */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-200 flex items-center justify-between h-12 px-3">
        <button onClick={() => setMobileMenuOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors">
          <Menu className="w-5 h-5 text-neutral-700" />
        </button>
        <h1 style={{ fontFamily: "var(--font-serif)" }} className="text-sm font-semibold text-neutral-900">Emeraldress Admin</h1>
        <button onClick={() => router.push("/")} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors">
          <Home className="w-4 h-4 text-neutral-500" />
        </button>
      </header>

      {/* ── Mobile Slide-out Menu ── */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 pt-5 pb-3 border-b border-neutral-100">
            <SheetTitle className="text-left">
              <p className="text-[10px] tracking-[0.2em] text-neutral-400 uppercase">Admin</p>
              <p style={{ fontFamily: "var(--font-serif)" }} className="text-base font-semibold text-neutral-900">Emeraldress</p>
            </SheetTitle>
          </SheetHeader>
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {nav.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleMobileNav(id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all text-sm ${
                  section === id
                    ? "bg-emerald-950 text-white"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </nav>
          <div className="border-t border-neutral-100 px-2 py-3 space-y-0.5">
            <button
              onClick={() => { setMobileMenuOpen(false); router.push("/"); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all text-sm"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Torna al Sito</span>
            </button>
            <button
              onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-500 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Esci</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 min-h-0">
          {/* ── Loading state ── */}
          {authState === "loading" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── Auto-redirect a /login ─────────────────────────────────────
              Il middleware redirige già a /login se non sei admin, ma se
              per qualche edge case (cookie stantio, race condition) la
              pagina viene comunque montata, redirezziamo lato client.
              Niente LoginForm interna duplicata.                          */}
          {(authState === "unauthenticated" || authState === "not-admin") && (
            <AdminRedirectGuard mode={authState} />
          )}

          {/* ── Admin dashboard (sidebar + content) ── */}
          {authState === "admin" && (<>
          {/* ── Sidebar (desktop only) ── */}
          <aside className="hidden lg:flex w-56 bg-white border-r border-neutral-100 flex-col py-6 shrink-0">
            {/* Brand */}
            <div className="px-4 mb-8">
              <p className="text-xs tracking-[0.2em] text-neutral-400 uppercase font-sans">Admin</p>
              <h1 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900 leading-tight">
                Emeraldress
              </h1>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-2 space-y-1">
              {nav.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${
                    section === id
                      ? "bg-emerald-950 text-white shadow-sm"
                      : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                  {section === id && <ChevronRight className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </nav>

            {/* Back to site */}
            <div className="px-2 mt-4 space-y-1">
              <button
                onClick={() => router.push("/")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-emerald-700 hover:bg-emerald-50 transition-all duration-200"
              >
                <Home className="w-4 h-4 shrink-0" />
                <span className="text-sm">Torna al Sito</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="text-sm">Esci</span>
              </button>
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main className="flex-1 overflow-auto overflow-x-hidden p-3 lg:p-6">
            <AnimatePresence mode="wait">

              {/* ══ ANALYTICS ══════════════════════════════════════════════════ */}
              {section === "analytics" && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <AnalyticsDashboard />
                </motion.div>
              )}

              {/* ══ RETURNS ══════════════════════════════════════════════════ */}
              {section === "returns" && (
                <motion.div
                  key="returns"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <ReturnsAdminSection />
                </motion.div>
              )}

              {/* ══ DASHBOARD ══════════════════════════════════════════════════ */}
              {section === "dashboard" && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-4 lg:mb-6">
                    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-lg lg:text-2xl font-semibold text-neutral-900">
                      Panoramica
                    </h2>
                    <p className="text-xs lg:text-sm text-neutral-400 mt-0.5">Benvenuto nella dashboard di amministrazione</p>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-4 mb-4 lg:mb-8">
                    {[
                      {
                        icon: MousePointerClick,
                        label: "In checkout",
                        value: activeReservations.toString(),
                        sub: activeReservations === 1 ? "cliente attivo ora" : "clienti attivi ora",
                        color: activeReservations > 0 ? "text-emerald-700" : "text-neutral-500",
                        bg: activeReservations > 0 ? "bg-emerald-50" : "bg-neutral-50",
                        live: true,
                      },
                      {
                        icon: ShoppingBag,
                        label: "Totale Ordini",
                        value: orders.length.toString(),
                        sub: "ordini totali",
                        color: "text-emerald-700",
                        bg: "bg-emerald-50",
                      },
                      {
                        icon: DollarSign,
                        label: "Fatturato",
                        value: `€${totalRevenue.toFixed(2)}`,
                        sub: "ultimi 30 giorni",
                        color: "text-emerald-700",
                        bg: "bg-emerald-50",
                      },
                      {
                        icon: Archive,
                        label: "Prodotti in Stock",
                        value: totalStock.toString(),
                        sub: `su ${products.length} prodotti`,
                        color: "text-emerald-700",
                        bg: "bg-emerald-50",
                      },
                    ].map(({ icon: Icon, label, value, sub, color, bg, live }) => (
                      <div key={label} className="bg-white rounded-xl lg:rounded-2xl border border-neutral-100 p-3 lg:p-5 shadow-sm flex items-center gap-3 sm:block relative">
                        {live && (
                          <span className="absolute top-2 right-2 flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${activeReservations > 0 ? "bg-emerald-400" : "bg-neutral-300"} opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${activeReservations > 0 ? "bg-emerald-500" : "bg-neutral-400"}`}></span>
                          </span>
                        )}
                        <div className={`w-8 h-8 lg:w-10 lg:h-10 ${bg} rounded-lg lg:rounded-xl flex items-center justify-center sm:mb-3`}>
                          <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] lg:text-xs text-neutral-400 uppercase tracking-wider font-sans">{label}</p>
                          <p style={{ fontFamily: "var(--font-serif)" }} className="text-lg lg:text-2xl font-semibold text-neutral-900">{value}</p>
                          <p className="text-[10px] lg:text-xs text-neutral-400">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Analytics Widgets */}
                  <div className="grid grid-cols-2 gap-2 lg:gap-4 mb-4 lg:mb-8">
                    <div className="bg-white rounded-xl lg:rounded-2xl border border-neutral-100 p-3 lg:p-5 shadow-sm">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 bg-emerald-50 rounded-lg lg:rounded-xl flex items-center justify-center mb-2 lg:mb-4">
                        <BarChart3 className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-700" />
                      </div>
                      <p className="text-[10px] lg:text-xs text-neutral-400 uppercase tracking-wider font-sans">Visite Oggi</p>
                      <p style={{ fontFamily: "var(--font-serif)" }} className="text-lg lg:text-2xl font-semibold text-neutral-900">{visitsToday}</p>
                      <p className="text-[10px] lg:text-xs text-neutral-400">ultime 24 ore</p>
                    </div>
                    <div className="bg-white rounded-xl lg:rounded-2xl border border-neutral-100 p-3 lg:p-5 shadow-sm">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 bg-emerald-50 rounded-lg lg:rounded-xl flex items-center justify-center mb-2 lg:mb-4">
                        <MousePointerClick className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-700" />
                      </div>
                      <p className="text-[10px] lg:text-xs text-neutral-400 uppercase tracking-wider font-sans">Conversione</p>
                      <p style={{ fontFamily: "var(--font-serif)" }} className="text-lg lg:text-2xl font-semibold text-neutral-900">
                        {uniqueVisitors > 0 ? ((orders.length / uniqueVisitors) * 100).toFixed(1) : "0.0"}%
                      </p>
                      <p className="text-[10px] lg:text-xs text-neutral-400">{orders.length} ordini / {uniqueVisitors} visitatori</p>
                    </div>
                  </div>

                  {/* Low Stock Alert */}
                  {(() => {
                    const outOfStock = products.filter((p) => p.stock === 0);
                    const lowStock = products.filter((p) => p.stock > 0 && p.stock < 3);
                    const alertProducts = [...outOfStock, ...lowStock];
                    const isSendingRef = { current: false };
                    return (
                      <div className="bg-white rounded-2xl border border-neutral-100 p-5 shadow-sm mb-8">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-base font-semibold text-neutral-900">
                              Allerta Scorte in Esaurimento
                            </h3>
                            <p className="text-xs text-neutral-400">{alertProducts.length} prodotti da monitorare</p>
                          </div>
                        </div>
                        {alertProducts.length === 0 ? (
                          <div className="text-center py-6">
                            <p className="text-sm text-emerald-600 font-medium">✓ Tutte le scorte sono a livello ottimale</p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {alertProducts.map((p) => (
                                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                                  {p.images?.[0] ? (
                                    <img src={p.images[0]} alt={p.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-neutral-200 flex items-center justify-center flex-shrink-0">
                                      <ImageIcon className="w-4 h-4 text-neutral-400" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-neutral-900 truncate">{p.name}</p>
                                    {p.sizes && p.sizes.length > 0 && (
                                      <p className="text-xs text-neutral-400">Taglie: {p.sizes.join(", ")}</p>
                                    )}
                                  </div>
                                  {p.stock === 0 ? (
                                    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">Esaurito</Badge>
                                  ) : (
                                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs">{p.stock} rimasti</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                            <Button
                              className="mt-4 w-full bg-orange-600 hover:bg-orange-700 text-white rounded-xl gap-2 text-sm"
                              onClick={async () => {
                                if (isSendingRef.current) return;
                                isSendingRef.current = true;
                                try {
                                  const webhookUrl = process.env.NEXT_PUBLIC_N8N_STOCK_URL;
                                  if (webhookUrl) {
                                    await fetch(webhookUrl, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        products: alertProducts.map((p) => ({
                                          name: p.name,
                                          stock: p.stock,
                                          sizes: p.sizes,
                                        })),
                                      }),
                                    });
                                  }
                                  toast.success("Notifica di rifornimento inviata!");
                                } catch {
                                  toast.error("Errore nell'invio della notifica");
                                } finally {
                                  isSendingRef.current = false;
                                }
                              }}
                            >
                              <Send className="w-4 h-4" /> Notifica Necessità Rifornimento
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Chart */}
                  <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-base font-semibold text-neutral-900">
                          Andamento Vendite
                        </h3>
                        <p className="text-xs text-neutral-400">Ultimi 30 giorni</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Fatturato</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval={4} />
                        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${v}`} />
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                          formatter={(v: number) => [`€${v.toFixed(2)}`, "Fatturato"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#064e3b"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 5, fill: "#064e3b", strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}

              {/* ══ COLLECTIONS ════════════════════════════════════════════════ */}
              {section === "collections" && (
                <motion.div
                  key="collections"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                        Collezioni
                      </h2>
                      <p className="text-sm text-neutral-400 mt-0.5">{collections.length} collezioni totali</p>
                    </div>
                    <Button
                      onClick={openNewCollection}
                      className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" /> Nuova Collezione
                    </Button>
                  </div>

                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            {["Nome", "Descrizione", "Stato", "Azioni"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {collections.map((c) => (
                            <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-neutral-900">{c.name}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500 max-w-xs truncate">{c.description || "—"}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                                  c.is_active
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-neutral-100 text-neutral-500"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? "bg-emerald-500" : "bg-neutral-400"}`} />
                                  {c.is_active ? "Attiva" : "Inattiva"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditCollection(c)}
                                    className="p-1.5 text-neutral-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteCollection(c.id)}
                                    className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {collections.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-12 text-center text-sm text-neutral-400">
                                Nessuna collezione. Crea la tua prima collezione!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Collection drawer */}
                  <AnimatePresence>
                    {collectionDrawerOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                          onClick={() => setCollectionDrawerOpen(false)}
                        />
                        <motion.div
                          initial={{ x: "100%" }}
                          animate={{ x: 0 }}
                          exit={{ x: "100%" }}
                          transition={{ type: "spring", damping: 30, stiffness: 300 }}
                          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col"
                        >
                          <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                            <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900">
                              {editingCollection ? "Modifica Collezione" : "Nuova Collezione"}
                            </h3>
                            <button onClick={() => setCollectionDrawerOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors">
                              <X className="w-4 h-4 text-neutral-500" />
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Nome *</Label>
                              <Input
                                value={collectionForm.name}
                                onChange={(e) => setCollectionForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="es. Primavera/Estate 2025"
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Descrizione</Label>
                              <Textarea
                                value={collectionForm.description}
                                onChange={(e) => setCollectionForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Descrizione della collezione..."
                                rows={3}
                                className="rounded-xl border-neutral-200 resize-none focus:ring-emerald-600"
                              />
                            </div>
                            <div className="flex items-center justify-between py-3 px-4 bg-neutral-50 rounded-xl">
                              <div>
                                <p className="text-sm font-medium text-neutral-900">Collezione Attiva</p>
                                <p className="text-xs text-neutral-400">Visibile sulla piattaforma</p>
                              </div>
                              <Switch
                                checked={collectionForm.is_active}
                                onCheckedChange={(v) => setCollectionForm((f) => ({ ...f, is_active: v }))}
                                className="data-[state=checked]:bg-emerald-700"
                              />
                            </div>
                          </div>
                          <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
                            <Button variant="outline" onClick={() => setCollectionDrawerOpen(false)} className="flex-1 rounded-xl border-neutral-200">
                              Annulla
                            </Button>
                            <Button onClick={handleCollectionSubmit} disabled={collectionSubmitting} className="flex-1 bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl">
                              {collectionSubmitting ? "Salvataggio..." : editingCollection ? "Aggiorna" : "Crea"}
                            </Button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {section === "products" && (
                <motion.div
                  key="products"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                        Prodotti
                      </h2>
                      <p className="text-sm text-neutral-400 mt-0.5">{products.length} prodotti totali</p>
                    </div>
                    <Button
                      onClick={openNewProduct}
                      className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" /> Nuovo Prodotto
                    </Button>
                  </div>

                  {/* Products table */}
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            {["Prodotto", "Prezzo", "Stock", "Stato", "Azioni"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {products.map((p) => (
                            <tr key={p.id} className="hover:bg-neutral-50 transition-colors">
                               {/* Product */}
                               <td className="px-4 py-3">
                                 <div className="flex items-center gap-3">
                                   {/* Image stack: show up to 3 thumbnails */}
                                   <div className="flex gap-1 shrink-0">
                                     {(p.images?.length ? p.images.slice(0, 3) : []).map((img, i) => (
                                       <div key={i} className="w-9 h-9 rounded-md bg-neutral-100 overflow-hidden border border-neutral-200">
                                         <img src={img} alt="" className="w-full h-full object-cover" />
                                       </div>
                                     ))}
                                     {!p.images?.length && (
                                       <div className="w-9 h-9 rounded-md bg-neutral-100 flex items-center justify-center border border-neutral-200">
                                         <Package className="w-4 h-4 text-neutral-300" />
                                       </div>
                                     )}
                                     {p.images?.length > 3 && (
                                       <div className="w-9 h-9 rounded-md bg-neutral-100 flex items-center justify-center border border-neutral-200">
                                         <span className="text-[10px] text-neutral-400 font-medium">+{p.images.length - 3}</span>
                                       </div>
                                     )}
                                   </div>
                                   <div>
                                     <p className="text-sm font-medium text-neutral-900 line-clamp-1">{p.name}</p>
                                     <p className="text-xs text-neutral-400 capitalize">{p.category}</p>
                                   </div>
                                 </div>
                               </td>
                              {/* Price */}
                              <td className="px-4 py-3">
                                <div>
                                  {p.sale_price ? (
                                    <>
                                      <span className="text-sm font-medium text-emerald-700">€{p.sale_price.toFixed(2)}</span>
                                      <span className="text-xs text-neutral-400 line-through ml-1.5">€{p.price.toFixed(2)}</span>
                                    </>
                                  ) : (
                                    <span className="text-sm font-medium text-neutral-900">€{p.price.toFixed(2)}</span>
                                  )}
                                </div>
                              </td>
                              {/* Stock */}
                              <td className="px-4 py-3">
                                <span className={`text-sm font-medium ${p.stock === 0 ? "text-red-500" : "text-neutral-900"}`}>
                                  {p.stock ?? 0}
                                </span>
                              </td>
                              {/* Status: select a tre voci, non un interruttore.
                                  Con tre stati il bottone occhio era ambiguo, e su
                                  iPad un invito a sbagliare. */}
                              <td className="px-4 py-3">
                                {(() => {
                                  const st = normalizeStatus(p.status);
                                  return (
                                    <select
                                      value={st}
                                      onChange={(e) => setProductStatus(p, e.target.value as ProductStatus)}
                                      aria-label={`Stato di ${p.name.trim()}`}
                                      className={`appearance-none cursor-pointer text-xs px-2.5 py-1 pr-6 rounded-full font-medium border-0 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat ${STATUS_PILL[st]}`}
                                      style={{
                                        backgroundImage:
                                          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path fill='currentColor' d='M2 4.5L6 8.5L10 4.5'/></svg>\")",
                                      }}
                                    >
                                      <option value="active">{STATUS_LABEL.active}</option>
                                      <option value="showcase">{STATUS_LABEL.showcase}</option>
                                      <option value="draft">{STATUS_LABEL.draft}</option>
                                    </select>
                                  );
                                })()}
                              </td>
                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditProduct(p)}
                                    className="p-1.5 text-neutral-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteProduct(p.id)}
                                    className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {products.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-400">
                                Nessun prodotto. Crea il tuo primo prodotto!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ══ ORDERS ═════════════════════════════════════════════════════ */}
              {section === "orders" && (
                <motion.div
                  key="orders"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6">
                    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                      Ordini
                    </h2>
                    <p className="text-sm text-neutral-400 mt-0.5">{orders.length} ordini totali</p>
                  </div>

                  {/* Order detail view */}
                  {selectedOrder ? (
                    <div className="space-y-4">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)} className="gap-2 text-neutral-500 hover:text-neutral-900">
                        <ChevronRight className="w-4 h-4 rotate-180" /> Torna alla lista
                      </Button>
                      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-neutral-400 mb-1">ID Ordine</p>
                            <p className="text-sm font-mono text-neutral-700 truncate">{selectedOrder.id}</p>
                          </div>
                          <div>
                            <p className="text-xs text-neutral-400 mb-1">Cliente</p>
                            <p className="text-sm text-neutral-900">{selectedOrder.customer_email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-neutral-400 mb-1">Totale</p>
                            <p className="text-sm font-medium text-neutral-900">€{Number(selectedOrder.total_amount).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-neutral-400 mb-1">Stato</p>
                            <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[selectedOrder.status] || "bg-neutral-100 text-neutral-600"}`}>
                              {selectedOrder.status}
                            </span>
                          </div>
                        </div>

                        {/* Items */}
                        {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
                          <div>
                            <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wider font-medium">Articoli</p>
                            <div className="space-y-2">
                              {(selectedOrder.items as any[]).map((item: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-2.5 text-sm">
                                  <span className="text-neutral-800">{item.name || item.product_name || `Articolo ${i + 1}`}</span>
                                  <div className="flex gap-4 text-neutral-500">
                                    {item.quantity && <span>x{item.quantity}</span>}
                                    {item.size && <span>Taglia: {item.size}</span>}
                                    {item.price && <span>€{Number(item.price).toFixed(2)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Shipping management */}
                        <div className="border-t border-neutral-100 pt-6">
                          <h3 className="text-base font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-700" />
                            Gestione Spedizione
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <Label className="text-xs text-neutral-500 mb-1.5 block">Numero Tracking</Label>
                              <Input
                                placeholder="es. 1Z999AA10123456784"
                                value={shippingForm.tracking_number}
                                onChange={(e) => setShippingForm((p) => ({ ...p, tracking_number: e.target.value }))}
                                className="rounded-xl border-neutral-200"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-neutral-500 mb-1.5 block">URL Tracking</Label>
                              <Input
                                placeholder="https://tracking.corriere.it/..."
                                value={shippingForm.tracking_url}
                                onChange={(e) => setShippingForm((p) => ({ ...p, tracking_url: e.target.value }))}
                                className="rounded-xl border-neutral-200"
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              onClick={handleSaveShipping}
                              disabled={shippingSaving || !shippingForm.tracking_number}
                              className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
                            >
                              {shippingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Salva tracking e notifica cliente
                            </Button>
                            {selectedOrder.status === "shipped" && (
                              <Button
                                onClick={handleMarkDelivered}
                                disabled={shippingSaving}
                                variant="outline"
                                className="rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-2"
                              >
                                <PackageCheck className="w-4 h-4" />
                                Marca come consegnato
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Return management */}
                        <div className="border-t border-orange-200 pt-6">
                          <h3 className="text-base font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                            <RotateCcw className="w-4 h-4 text-orange-600" />
                            Gestione Reso
                          </h3>
                          {(!selectedOrder.return_status || selectedOrder.return_status === "none") ? (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                              <p className="text-sm text-orange-700 mb-3">Nessuna procedura di reso avviata per questo ordine.</p>
                              <Button
                                variant="outline"
                                className="rounded-xl border-orange-300 text-orange-700 hover:bg-orange-100 gap-2"
                                onClick={async () => {
                                  if (!confirm("Sei sicuro di voler avviare il reso per questo ordine?")) return;
                                  try {
                                    const { error } = await supabase
                                      .from("orders")
                                      .update({ return_status: "requested" } as any)
                                      .eq("id", selectedOrder.id);
                                    if (error) throw error;

                                    const webhookUrl = process.env.NEXT_PUBLIC_N8N_RETURN_URL;
                                    if (webhookUrl) {
                                      await fetch(webhookUrl, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          order_id: selectedOrder.id,
                                          customer_email: selectedOrder.customer_email,
                                          total_amount: selectedOrder.total_amount,
                                          items: selectedOrder.items,
                                        }),
                                      });
                                    }

                                    setSelectedOrder({ ...selectedOrder, return_status: "requested" });
                                    setOrders((prev) => prev.map((o) => o.id === selectedOrder.id ? { ...o, return_status: "requested" } : o));
                                    toast.success("Procedura di reso avviata e notifica inviata");
                                  } catch (err: any) {
                                    toast.error("Errore: " + (err.message || "Operazione fallita"));
                                  }
                                }}
                              >
                                <AlertTriangle className="w-4 h-4" />
                                Avvia Procedura Reso
                              </Button>
                            </div>
                          ) : (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-orange-500 uppercase tracking-wider font-medium">Stato Reso:</span>
                                <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${
                                  selectedOrder.return_status === "requested" ? "bg-orange-100 text-orange-700" :
                                  selectedOrder.return_status === "approved" ? "bg-blue-100 text-blue-700" :
                                  selectedOrder.return_status === "completed" ? "bg-green-100 text-green-700" :
                                  "bg-neutral-100 text-neutral-600"
                                }`}>
                                  {selectedOrder.return_status}
                                </span>
                              </div>
                              {selectedOrder.return_label_url && (
                                <a
                                  href={selectedOrder.return_label_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sm text-orange-700 hover:text-orange-900 underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Scarica Etichetta Reso
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-neutral-100">
                              {["Data", "Cliente", "Totale", "Stato", ""].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {orders.map((o) => {
                              const isFresh = newOrderIds.has(o.id);
                              return (
                              <tr
                                key={o.id}
                                className={`hover:bg-neutral-50 transition-colors cursor-pointer ${isFresh ? "animate-pulse bg-emerald-50/60" : ""}`}
                                onClick={() => { setSelectedOrder(o); setShippingForm({ tracking_number: o.tracking_number || "", tracking_url: o.tracking_url || "" }); }}
                              >
                                <td className="px-4 py-3 text-sm text-neutral-600">
                                  <div className="flex items-center gap-2">
                                    {isFresh && (
                                      <span className="inline-flex items-center text-[9px] tracking-[0.2em] uppercase px-1.5 py-0.5 rounded-full bg-emerald-700 text-white font-bold">
                                        Nuovo
                                      </span>
                                    )}
                                    {new Date(o.created_at).toLocaleDateString("it-IT")}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-900">{o.customer_email}</td>
                                <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                                  €{Number(o.total_amount).toFixed(2)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[o.status] || "bg-neutral-100 text-neutral-600"}`}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <ChevronRight className="w-4 h-4 text-neutral-300" />
                                </td>
                              </tr>
                              );
                            })}
                            {orders.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-400">
                                  Nessun ordine ancora
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ══ CLIENTI CRM ═══════════════════════════════════════════════ */}
              {section === "clients" && (
                <motion.div
                  key="clients"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <CustomersAdminSection />
                </motion.div>
              )}

              {/* ══ RECENSIONI ════════════════════════════════════════════════ */}
              {section === "reviews" && (
                <motion.div
                  key="reviews"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-6">
                    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                      Recensioni
                    </h2>
                    <p className="text-sm text-neutral-400 mt-0.5">
                      {reviews.length} recensioni &middot; {reviews.filter(r => r.is_approved).length} approvate
                    </p>
                  </div>

                  {reviews.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                      <MessageSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                      <p className="text-neutral-500">Nessuna recensione ricevuta.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-100 bg-neutral-50/50">
                              <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Prodotto</th>
                              <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Cliente</th>
                              <th className="text-center py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Voto</th>
                              <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Commento</th>
                              <th className="text-center py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Foto</th>
                              <th className="text-center py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Stato</th>
                              <th className="text-center py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wider">Azioni</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reviews.map((r) => (
                              <tr key={r.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                                <td className="py-3 px-4">
                                  <p className="font-medium text-neutral-900 text-sm truncate max-w-[160px]">{r.product_name}</p>
                                  <p className="text-xs text-neutral-400">{new Date(r.created_at).toLocaleDateString("it-IT")}</p>
                                </td>
                                <td className="py-3 px-4 text-neutral-700">{r.customer_name}</td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`w-3.5 h-3.5 ${i < r.rating ? "text-amber-400 fill-amber-400" : "text-neutral-200"}`}
                                      />
                                    ))}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-neutral-600 text-xs max-w-[240px] truncate">
                                  {r.comment || <span className="italic text-neutral-300">Nessun commento</span>}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {r.photo_urls && r.photo_urls.length > 0 ? (
                                    <div className="flex items-center justify-center gap-1">
                                      {r.photo_urls.slice(0, 3).map((url) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <a
                                          key={url}
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="w-10 h-10 rounded-md overflow-hidden border border-neutral-200 hover:border-emerald-400 transition-colors block"
                                          title="Apri foto"
                                        >
                                          <img src={url} alt="" className="w-full h-full object-cover" />
                                        </a>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-neutral-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <Switch
                                      checked={r.is_approved}
                                      onCheckedChange={async (val) => {
                                        const { error } = await supabase
                                          .from("reviews" as any)
                                          .update({ is_approved: val } as any)
                                          .eq("id", r.id);
                                        if (error) { toast.error(error.message); return; }
                                        setReviews((prev) => prev.map((rv) => rv.id === r.id ? { ...rv, is_approved: val } : rv));
                                        toast.success(val ? "Recensione approvata" : "Recensione nascosta");
                                      }}
                                    />
                                    <span className={`text-xs font-medium ${r.is_approved ? "text-emerald-600" : "text-neutral-400"}`}>
                                      {r.is_approved ? "Online" : "Nascosta"}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                    onClick={async () => {
                                      if (!confirm("Eliminare definitivamente questa recensione?")) return;
                                      const { error } = await supabase.from("reviews" as any).delete().eq("id", r.id);
                                      if (error) { toast.error(error.message); return; }
                                      setReviews((prev) => prev.filter((rv) => rv.id !== r.id));
                                      toast.success("Recensione eliminata");
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {section === "newsletter" && (
                <motion.div
                  key="newsletter"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                        Campagne Newsletter
                      </h2>
                      <p className="text-sm text-neutral-400 mt-0.5">
                        {subscribers.length} iscritti totali · <span className="text-emerald-700 font-medium">{activeSubscribers.length} attivi</span>
                        {selectedSubscribers.length > 0 && (
                          <> · <span className="text-emerald-900 font-semibold">Selezionati: {selectedSubscribers.length} su {activeSubscribers.length}</span></>
                        )}
                      </p>
                    </div>
                    <Button
                      onClick={exportCSV}
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-50 gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Esporta CSV</span>
                    </Button>
                  </div>

                  {/* KPI cards */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <Users className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="text-2xl font-semibold text-neutral-900">{activeSubscribers.length}</p>
                          <p className="text-xs text-neutral-400">Iscritti Attivi</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-neutral-500" />
                        </div>
                        <div>
                          <p className="text-2xl font-semibold text-neutral-900">{subscribers.length}</p>
                          <p className="text-xs text-neutral-400">Totale Iscritti</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <Send className="w-5 h-5 text-emerald-800" />
                        </div>
                        <div>
                          <p className="text-2xl font-semibold text-neutral-900">{selectedSubscribers.length}</p>
                          <p className="text-xs text-neutral-400">Selezionati</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subscribers table with checkboxes */}
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden mb-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={selectedSubscribers.length === activeSubscribers.length && activeSubscribers.length > 0}
                                onChange={toggleAllSubscribers}
                                className="w-4 h-4 rounded border-neutral-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                              />
                            </th>
                            {["Nome", "Email", "Telefono", "Fonte", "Stato", "Data"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {subscribers.map((s) => (
                            <tr key={s.id} className={`hover:bg-neutral-50 transition-colors ${selectedSubscribers.includes(s.email) ? "bg-emerald-50/40" : ""}`}>
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedSubscribers.includes(s.email)}
                                  onChange={() => toggleSubscriber(s.email)}
                                  disabled={!s.active}
                                  className="w-4 h-4 rounded border-neutral-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-900">{s.name || "—"}</td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{s.email}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{s.phone || "—"}</td>
                              <td className="px-4 py-3">
                                {s.source ? (
                                  <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 text-neutral-600">
                                    {s.source}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${
                                  s.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-400"
                                }`}>
                                  {s.active ? "Attivo" : "Inattivo"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {new Date(s.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                            </tr>
                          ))}
                          {subscribers.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-sm text-neutral-400">
                                Nessun iscritto alla newsletter
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                   {/* ── Template Selector + Preview + Send ────────────── */}
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6">
                    <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900 mb-5 flex items-center gap-2">
                      <Send className="w-5 h-5 text-emerald-700" />
                      Invio Campagna
                    </h3>

                    <div className="mb-4">
                      <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Scegli il Template da inviare</Label>
                      <select
                        value={selectedTemplate}
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="w-full h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="">— Seleziona un template —</option>
                        {emailTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Preview */}
                    {(() => {
                      const tpl = emailTemplates.find((t) => t.id === selectedTemplate);
                      if (!tpl) return null;
                      return (
                        <div className="mb-5 space-y-3">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-neutral-400 font-medium">Oggetto:</span>
                            <span className="text-neutral-800 font-semibold">{tpl.subject || "(nessun oggetto)"}</span>
                          </div>
                          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50">
                            <div className="px-4 py-2 bg-neutral-100 border-b border-neutral-200 text-xs text-neutral-400 uppercase tracking-wider">
                              Anteprima HTML
                            </div>
                            <div
                              className="p-4 prose prose-sm max-w-none text-neutral-700 overflow-auto max-h-[320px]"
                              dangerouslySetInnerHTML={{ __html: tpl.body_html }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mb-4">
                      <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">
                        Invio schedulato (opzionale)
                        <span className="ml-2 normal-case font-normal text-neutral-400">
                          — lascia vuoto per invio immediato
                        </span>
                      </Label>
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="rounded-xl border-neutral-200 h-10"
                      />
                      {scheduledAt && (
                        <p className="mt-1.5 text-xs text-emerald-700">
                          Verrà inviata il{" "}
                          <strong>{new Date(scheduledAt).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" })}</strong>{" "}
                          (gestita dal WF n8n)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                      <p className="text-sm text-neutral-400">
                        {selectedSubscribers.length > 0
                          ? `${selectedSubscribers.length} destinatari selezionati`
                          : "Seleziona almeno un destinatario dalla tabella"}
                      </p>
                      <Button
                        onClick={handleSendNewsletter}
                        disabled={sending || selectedSubscribers.length === 0 || !selectedTemplate}
                        className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 px-6"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Invio in corso...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Invia a {selectedSubscribers.length} destinatari
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* ── Storico invii recenti (email_log) ─────────────────────── */}
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-emerald-700" />
                        Storico invii (ultimi 50)
                      </h3>
                      <Button onClick={loadRecentSends} variant="outline" size="sm" className="rounded-xl border-neutral-200 text-neutral-600 hover:bg-neutral-50 gap-2">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Aggiorna
                      </Button>
                    </div>
                    {recentSends.length === 0 ? (
                      <p className="text-sm text-neutral-400 py-4 text-center">
                        Nessun invio ancora registrato. Le campagne inviate da qui verranno tracciate automaticamente.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-100">
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider">Data</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider">Template</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider">Destinatario</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider">Stato</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-50">
                            {recentSends.map((r) => (
                              <tr key={r.id} className="hover:bg-neutral-50">
                                <td className="px-3 py-2 text-xs text-neutral-500 whitespace-nowrap">
                                  {new Date(r.sent_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="px-3 py-2 text-xs text-neutral-700 max-w-[260px] truncate">{r.email_type}</td>
                                <td className="px-3 py-2 text-xs text-neutral-600">{r.recipient}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                                    r.status === "sent"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : r.status === "pending"
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-red-50 text-red-600"
                                  }`}>
                                    {r.status === "sent" ? "Inviata" : r.status === "pending" ? "In coda" : "Fallita"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ══ EMAIL TEMPLATES ═══════════════════════════════════════════ */}
              {section === "email_templates" && (
                <motion.div
                  key="email_templates"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  {!etShowEditor ? (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">Template Email</h2>
                          <p className="text-sm text-neutral-400 mt-0.5">Crea e gestisci i template per le campagne newsletter</p>
                        </div>
                        <Button onClick={openNewTemplate} className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2">
                          <Plus className="w-4 h-4" /> Nuovo Template
                        </Button>
                      </div>
                      {emailTemplates.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                          <Mail className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                          <p className="text-neutral-500">Nessun template salvato. Creane uno!</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wider">
                                <th className="px-5 py-3">Nome</th>
                                <th className="px-5 py-3">Oggetto</th>
                                <th className="px-5 py-3">Ultima Modifica</th>
                                <th className="px-5 py-3 text-right">Azioni</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emailTemplates.map((t) => (
                                <tr key={t.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                                  <td className="px-5 py-3 font-medium text-neutral-800">{t.name}</td>
                                  <td className="px-5 py-3 text-neutral-500 truncate max-w-[200px]">{t.subject || "—"}</td>
                                  <td className="px-5 py-3 text-neutral-400">{new Date(t.updated_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                  <td className="px-5 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" onClick={() => openEditTemplate(t)} className="h-8 w-8 text-neutral-500 hover:text-emerald-700">
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t.id)} className="h-8 w-8 text-neutral-500 hover:text-red-600">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <button onClick={() => setEtShowEditor(false)} className="text-xs text-neutral-400 hover:text-neutral-600 mb-1 flex items-center gap-1">
                            ← Torna alla lista
                          </button>
                          <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                            {etEditing ? "Modifica Template" : "Nuovo Template"}
                          </h2>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Nome Template</Label>
                            <Input
                              value={etForm.name}
                              onChange={(e) => setEtForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="es. Benvenuto, Promo Estiva..."
                              className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Oggetto Email</Label>
                            <Input
                              value={etForm.subject}
                              onChange={(e) => setEtForm((p) => ({ ...p, subject: e.target.value }))}
                              placeholder="es. La tua offerta esclusiva 🌿"
                              className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                            />
                          </div>
                        </div>

                        {/* Variable Inserter */}
                        <div>
                          <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Inserisci Variabile</Label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button" variant="outline" size="sm"
                              onClick={() => insertVariableIntoEditor("{{nome}}")}
                              className="rounded-lg border-neutral-200 text-neutral-600 hover:bg-emerald-50 hover:border-emerald-300 gap-1 text-xs"
                            >
                              <Users className="w-3 h-3" /> {"{{nome}}"}
                            </Button>
                            <Button
                              type="button" variant="outline" size="sm"
                              onClick={() => insertVariableIntoEditor("{{email}}")}
                              className="rounded-lg border-neutral-200 text-neutral-600 hover:bg-emerald-50 hover:border-emerald-300 gap-1 text-xs"
                            >
                              <Mail className="w-3 h-3" /> {"{{email}}"}
                            </Button>
                            {coupons.filter((c) => c.is_active).length > 0 && (
                              <div className="flex items-center gap-1 ml-2 border-l border-neutral-200 pl-3">
                                <Tag className="w-3 h-3 text-neutral-400" />
                                <span className="text-xs text-neutral-400 mr-1">Coupon:</span>
                                {coupons.filter((c) => c.is_active).map((c) => (
                                  <Button
                                    key={c.id} type="button" variant="outline" size="sm"
                                    onClick={() => insertVariableIntoEditor(`{{coupon:${c.code}}}`)}
                                    className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1 text-xs font-mono"
                                  >
                                    <Percent className="w-3 h-3" /> {c.code}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Editor Mode Toggle */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider">Corpo Email</Label>
                            <div className="flex gap-0.5 bg-neutral-100 rounded-lg p-0.5">
                              {([
                                { id: "visual" as const, label: "Editor Visuale", icon: Type },
                                { id: "html" as const, label: "Codice HTML", icon: Code },
                              ]).map(({ id, label, icon: Icon }) => (
                                <button
                                  key={id}
                                  onClick={() => setEtEditorMode(id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    etEditorMode === id
                                      ? "bg-white text-neutral-900 shadow-sm"
                                      : "text-neutral-500 hover:text-neutral-700"
                                  }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {etEditorMode === "visual" ? (
                            <RichTextEditor
                              value={etForm.body_html}
                              onChange={(val) => setEtForm((p) => ({ ...p, body_html: val }))}
                              className="rounded-xl overflow-hidden border border-neutral-200"
                            />
                          ) : (
                            <Textarea
                              value={etForm.body_html}
                              onChange={(e) => setEtForm((p) => ({ ...p, body_html: e.target.value }))}
                              placeholder="Incolla qui il codice HTML del template..."
                              rows={14}
                              className="rounded-xl border-neutral-200 focus:ring-emerald-600 font-mono text-xs leading-relaxed resize-y"
                            />
                          )}
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <Button variant="outline" onClick={() => setEtShowEditor(false)} className="rounded-xl border-neutral-200">
                            Annulla
                          </Button>
                          <Button
                            onClick={handleSaveTemplate}
                            disabled={etSaving}
                            className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 px-8"
                          >
                            {etSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...</> : "Salva Template"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* ══ SETTINGS ════════════════════════════════════════════════════ */}
              {section === "settings" && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6">
                    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                      Impostazioni Sito
                    </h2>
                    <p className="text-sm text-neutral-400 mt-0.5">Gestisci testi, immagini e branding del sito</p>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mb-6 bg-neutral-100 rounded-xl p-1 w-fit">
                    {([
                      { id: "texts" as const, label: "Testi", icon: Type },
                      { id: "images" as const, label: "Immagini", icon: ImageIcon },
                      { id: "branding" as const, label: "Branding", icon: Palette },
                      { id: "seo" as const, label: "SEO", icon: ScanSearch },
                      { id: "banner" as const, label: "Banner Top", icon: Megaphone },
                    ]).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setSettingsTab(id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          settingsTab === id
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-500 hover:text-neutral-700"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                   <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6">

                    {/* ── Tab Testi ── */}
                    {settingsTab === "texts" && (
                      <div className="space-y-8">
                        {/* Sezione Home */}
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-800 mb-1 flex items-center gap-2">
                            <LayoutDashboard className="w-4 h-4 text-emerald-700" /> Sezione Home
                          </h3>
                          <p className="text-xs text-neutral-400 mb-3">Testi visibili nella homepage principale.</p>
                          <div className="space-y-4 pl-6 border-l-2 border-emerald-100">
                            {[
                              { key: "home_title", label: "Titolo Hero", placeholder: "Lusso Consapevole" },
                              { key: "home_subtitle", label: "Sottotitolo Hero", placeholder: "Moda sostenibile, eleganza senza tempo" },
                              { key: "home_cta", label: "Testo CTA", placeholder: "Scopri la Collezione" },
                            ].map(({ key, label, placeholder }) => (
                              <div key={key}>
                                <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">{label}</Label>
                                <Input
                                  value={pageContent[key] || ""}
                                  onChange={(e) => setPageContent((prev) => ({ ...prev, [key]: e.target.value }))}
                                  placeholder={placeholder}
                                  className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Sezione Chi Siamo */}
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-800 mb-1 flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-700" /> Sezione Chi Siamo
                          </h3>
                          <p className="text-xs text-neutral-400 mb-3">Testi della pagina "Chi Siamo".</p>
                          <div className="space-y-4 pl-6 border-l-2 border-emerald-100">
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Titolo</Label>
                              <Input
                                value={pageContent["about_title"] || ""}
                                onChange={(e) => setPageContent((prev) => ({ ...prev, about_title: e.target.value }))}
                                placeholder="La Nostra Storia"
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Descrizione</Label>
                              <Textarea
                                value={pageContent["about_description"] || ""}
                                onChange={(e) => setPageContent((prev) => ({ ...prev, about_description: e.target.value }))}
                                placeholder="Racconta la storia del brand..."
                                rows={4}
                                className="rounded-xl border-neutral-200 resize-none focus:ring-emerald-600"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Sezione Sostenibilità */}
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-800 mb-1 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-700" /> Sezione Sostenibilità
                          </h3>
                          <p className="text-xs text-neutral-400 mb-3">Testi della pagina "Sostenibilità".</p>
                          <div className="space-y-4 pl-6 border-l-2 border-emerald-100">
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Titolo</Label>
                              <Input
                                value={pageContent["sustainability_title"] || ""}
                                onChange={(e) => setPageContent((prev) => ({ ...prev, sustainability_title: e.target.value }))}
                                placeholder="Il Nostro Impegno"
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Descrizione</Label>
                              <Textarea
                                value={pageContent["sustainability_description"] || ""}
                                onChange={(e) => setPageContent((prev) => ({ ...prev, sustainability_description: e.target.value }))}
                                placeholder="Descrivi l'impegno green del brand..."
                                rows={4}
                                className="rounded-xl border-neutral-200 resize-none focus:ring-emerald-600"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-800 mb-1 flex items-center gap-2">
                            <Code className="w-4 h-4 text-emerald-700" /> Footer
                          </h3>
                          <div className="space-y-4 pl-6 border-l-2 border-emerald-100">
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Tagline</Label>
                              <Input
                                value={pageContent["footer_tagline"] || ""}
                                onChange={(e) => setPageContent((prev) => ({ ...prev, footer_tagline: e.target.value }))}
                                placeholder="Emeraldress — Lusso Consapevole"
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Tab Immagini ── */}
                    {settingsTab === "images" && (
                      <div className="space-y-6">
                        <p className="text-sm text-neutral-500 mb-2">Carica e gestisci le immagini principali del sito. Ogni slot mostra l'immagine attualmente online.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {[
                            { key: "hero_bg", label: "Hero Homepage" },
                            { key: "logo_url", label: "Logo Sito" },
                            { key: "about_image", label: "Chi Siamo" },
                            { key: "sustainability_image", label: "Sostenibilità" },
                            { key: "og_image", label: "OG / Social" },
                          ].map(({ key, label }) => (
                            <div key={key} className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50">
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">{label}</Label>
                              {/* Preview */}
                              <div className="w-full aspect-video rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 mb-3 flex items-center justify-center">
                                {pageImages[key] ? (
                                  <img src={pageImages[key]} alt={label} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="flex flex-col items-center gap-1 text-neutral-400">
                                    <ImageIcon className="w-8 h-8" />
                                    <span className="text-xs">Nessuna immagine</span>
                                  </div>
                                )}
                              </div>
                              <Input
                                value={pageImages[key] || ""}
                                onChange={(e) => setPageImages((prev) => ({ ...prev, [key]: e.target.value }))}
                                placeholder="URL immagine..."
                                className="rounded-lg border-neutral-200 focus:ring-emerald-600 text-xs mb-2"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={settingsUploadingKey === key}
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/*";
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) handleSettingsImageUpload(key, file);
                                  };
                                  input.click();
                                }}
                                className="w-full rounded-lg border-neutral-200 text-neutral-600 hover:bg-neutral-50 gap-1.5 text-xs"
                              >
                                {settingsUploadingKey === key ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Caricamento...</>
                                ) : (
                                  <><Upload className="w-3 h-3" /> Sostituisci Immagine</>
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Tab Branding ── */}
                    {settingsTab === "branding" && (
                      <div className="space-y-6">
                        <p className="text-sm text-neutral-500 mb-2">Personalizza i colori principali del brand.</p>
                        {[
                          { key: "primary_color", label: "Colore Primario", defaultVal: "#004d40" },
                          { key: "secondary_color", label: "Colore Secondario", defaultVal: "#a7f3d0" },
                          { key: "accent_color", label: "Colore Accento", defaultVal: "#065f46" },
                        ].map(({ key, label, defaultVal }) => (
                          <div key={key} className="flex items-center gap-4 p-4 border border-neutral-200 rounded-xl bg-neutral-50/50">
                            <input
                              type="color"
                              value={branding[key] || defaultVal}
                              onChange={(e) => setBranding((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-14 h-14 rounded-xl border border-neutral-200 cursor-pointer p-1 shrink-0"
                            />
                            <div className="flex-1">
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1 block">{label}</Label>
                              <Input
                                value={branding[key] || ""}
                                onChange={(e) => setBranding((prev) => ({ ...prev, [key]: e.target.value }))}
                                placeholder={defaultVal}
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600 font-mono text-sm max-w-[200px]"
                              />
                            </div>
                            <div
                              className="w-20 h-14 rounded-xl border border-neutral-200 shrink-0"
                              style={{ backgroundColor: branding[key] || defaultVal }}
                            />
                          </div>
                        ))}
                        {/* Live preview */}
                        <div className="mt-4 p-4 rounded-xl border border-neutral-200 bg-white">
                          <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-3 block">Anteprima</Label>
                          <div className="flex gap-3 items-center">
                            <div className="px-5 py-2.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: branding.primary_color || "#004d40" }}>
                              Bottone Primario
                            </div>
                            <div className="px-5 py-2.5 rounded-lg text-sm font-medium border" style={{ backgroundColor: branding.secondary_color || "#a7f3d0", borderColor: branding.primary_color || "#004d40", color: branding.primary_color || "#004d40" }}>
                              Bottone Secondario
                            </div>
                            <div className="px-4 py-2.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: branding.accent_color || "#065f46" }}>
                              Accento
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Tab SEO ── */}
                    {settingsTab === "seo" && (
                      <div className="space-y-6">
                        <p className="text-sm text-neutral-500 mb-2">Configura i meta tag SEO della homepage e l'immagine di anteprima social.</p>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Meta Title</Label>
                            <Input
                              value={seoSettings.meta_title || ""}
                              onChange={(e) => setSeoSettings((p) => ({ ...p, meta_title: e.target.value }))}
                              placeholder="Emeraldress | Abbigliamento Sostenibile di Lusso"
                              className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              maxLength={60}
                            />
                            <p className="text-xs text-neutral-400 mt-1">{(seoSettings.meta_title || "").length}/60 caratteri</p>
                          </div>
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Meta Description</Label>
                            <Textarea
                              value={seoSettings.meta_description || ""}
                              onChange={(e) => setSeoSettings((p) => ({ ...p, meta_description: e.target.value }))}
                              placeholder="Scopri l'esclusiva collezione Emeraldress: abiti realizzati in Italia con tessuti sostenibili..."
                              rows={3}
                              className="rounded-xl border-neutral-200 resize-none focus:ring-emerald-600"
                              maxLength={160}
                            />
                            <p className="text-xs text-neutral-400 mt-1">{(seoSettings.meta_description || "").length}/160 caratteri</p>
                          </div>
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Social Preview Image (OG Image)</Label>
                            <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50">
                              <div className="w-full aspect-video rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 mb-3 flex items-center justify-center max-w-md">
                                {seoSettings.og_image_url ? (
                                  <img src={seoSettings.og_image_url} alt="OG Preview" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="flex flex-col items-center gap-1 text-neutral-400">
                                    <ImageIcon className="w-8 h-8" />
                                    <span className="text-xs">Nessuna immagine OG</span>
                                  </div>
                                )}
                              </div>
                              <Input
                                value={seoSettings.og_image_url || ""}
                                onChange={(e) => setSeoSettings((p) => ({ ...p, og_image_url: e.target.value }))}
                                placeholder="URL immagine OG..."
                                className="rounded-lg border-neutral-200 focus:ring-emerald-600 text-xs mb-2 max-w-md"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={seoUploading}
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/*";
                                  input.onchange = async (ev) => {
                                    const file = (ev.target as HTMLInputElement).files?.[0];
                                    if (!file) return;
                                    setSeoUploading(true);
                                    try {
                                      const ext = file.name.split(".").pop();
                                      const path = `site/og-image-${Date.now()}.${ext}`;
                                      const { error: upErr } = await supabase.storage.from("emerald-asset").upload(path, file, { upsert: true });
                                      if (upErr) throw upErr;
                                      const { data: urlData } = supabase.storage.from("emerald-asset").getPublicUrl(path);
                                      setSeoSettings((p) => ({ ...p, og_image_url: urlData.publicUrl }));
                                      toast.success("Immagine OG caricata");
                                    } catch (err: any) {
                                      toast.error(err.message || "Errore upload");
                                    } finally {
                                      setSeoUploading(false);
                                    }
                                  };
                                  input.click();
                                }}
                                className="rounded-lg border-neutral-200 text-neutral-600 hover:bg-neutral-50 gap-1.5 text-xs"
                              >
                                {seoUploading ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Caricamento...</>
                                ) : (
                                  <><Upload className="w-3 h-3" /> Carica Immagine OG</>
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-neutral-400 mt-2">Dimensione consigliata: 1200×630 px. Verrà usata come anteprima su Facebook, Twitter, WhatsApp, ecc.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Tab Banner Top ── */}
                    {settingsTab === "banner" && (
                      <div className="space-y-6">
                        <p className="text-sm text-neutral-500 mb-2">Configura la striscia promozionale visibile in cima a tutte le pagine del sito.</p>

                        <div className="flex items-center gap-3">
                          <Switch
                            checked={promoBanner.is_active}
                            onCheckedChange={(v) => setPromoBanner((p) => ({ ...p, is_active: v }))}
                          />
                          <Label className="text-sm font-medium">{promoBanner.is_active ? "Banner attivo" : "Banner disattivato"}</Label>
                        </div>

                        <div>
                          <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Testo del Banner</Label>
                          <Input
                            value={promoBanner.text}
                            onChange={(e) => setPromoBanner((p) => ({ ...p, text: e.target.value }))}
                            placeholder="Es. Spedizione Gratuita sopra i 50€"
                            className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Link opzionale</Label>
                          <div className="relative">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                            <Input
                              value={promoBanner.link}
                              onChange={(e) => setPromoBanner((p) => ({ ...p, link: e.target.value }))}
                              placeholder="Es. /collezioni"
                              className="rounded-xl border-neutral-200 focus:ring-emerald-600 pl-9"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Colore Sfondo</Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={promoBanner.bg_color}
                                onChange={(e) => setPromoBanner((p) => ({ ...p, bg_color: e.target.value }))}
                                className="w-10 h-10 rounded-lg border border-neutral-200 cursor-pointer p-0.5"
                              />
                              <Input
                                value={promoBanner.bg_color}
                                onChange={(e) => setPromoBanner((p) => ({ ...p, bg_color: e.target.value }))}
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600 font-mono text-sm"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Colore Testo</Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={promoBanner.text_color}
                                onChange={(e) => setPromoBanner((p) => ({ ...p, text_color: e.target.value }))}
                                className="w-10 h-10 rounded-lg border border-neutral-200 cursor-pointer p-0.5"
                              />
                              <Input
                                value={promoBanner.text_color}
                                onChange={(e) => setPromoBanner((p) => ({ ...p, text_color: e.target.value }))}
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600 font-mono text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Live preview */}
                        <div>
                          <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Anteprima</Label>
                          <div
                            className="rounded-xl overflow-hidden text-center py-2.5 px-4 text-sm font-medium tracking-wide"
                            style={{ backgroundColor: promoBanner.bg_color, color: promoBanner.text_color }}
                          >
                            {promoBanner.text || "Testo del banner..."}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end mt-6">
                    <Button
                      onClick={saveSettings}
                      disabled={settingsSaving}
                      className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 px-8"
                    >
                      {settingsSaving ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...</>
                      ) : (
                        "Salva Impostazioni"
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ══ MARKETING / COUPON ══════════════════════════════════════════ */}
              {section === "marketing" && (
                <motion.div
                  key="marketing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                        Coupon & Marketing
                      </h2>
                      <p className="text-sm text-neutral-400 mt-0.5">{coupons.length} coupon totali · {coupons.filter(c => c.is_active).length} attivi</p>
                    </div>
                    <Button onClick={openNewCoupon} className="bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl gap-2 text-sm">
                      <Plus className="w-4 h-4" /> Nuovo Coupon
                    </Button>
                  </div>

                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            {["Codice", "Tipo", "Valore", "Utilizzi", "Scadenza", "Stato", "Azioni"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {coupons.map((c) => {
                            const expired = c.valid_until && new Date(c.valid_until) < new Date();
                            return (
                              <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <code className="text-sm font-mono font-semibold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">{c.code}</code>
                                    <button
                                      onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Codice copiato"); }}
                                      className="p-1 text-neutral-300 hover:text-neutral-600 transition-colors"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                                    c.discount_type === "percentage" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
                                  }`}>
                                    {c.discount_type === "percentage" ? <Percent className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                                    {c.discount_type === "percentage" ? "Percentuale" : "Fisso"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                                  {c.discount_type === "percentage" ? `${c.value}%` : `€${c.value.toFixed(2)}`}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-600">
                                  {c.used_count}{c.usage_limit != null ? ` / ${c.usage_limit}` : ""}
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-500">
                                  {c.valid_until ? (
                                    <span className={expired ? "text-red-500" : ""}>
                                      {new Date(c.valid_until).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                                      {expired && " (scaduto)"}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <button onClick={() => toggleCouponActive(c)}>
                                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer ${
                                      c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? "bg-emerald-500" : "bg-neutral-400"}`} />
                                      {c.is_active ? "Attivo" : "Inattivo"}
                                    </span>
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => openEditCoupon(c)} className="p-1.5 text-neutral-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteCoupon(c.id)} className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {coupons.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-sm text-neutral-400">
                                Nessun coupon. Crea il tuo primo coupon!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Coupon Drawer */}
                  <AnimatePresence>
                    {couponDrawerOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                          onClick={() => setCouponDrawerOpen(false)}
                        />
                        <motion.div
                          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                          transition={{ type: "spring", damping: 30, stiffness: 300 }}
                          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col"
                        >
                          <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                            <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900">
                              {editingCoupon ? "Modifica Coupon" : "Nuovo Coupon"}
                            </h3>
                            <button onClick={() => setCouponDrawerOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors">
                              <X className="w-4 h-4 text-neutral-500" />
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            {/* Code */}
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Codice *</Label>
                              <div className="flex gap-2">
                                <Input
                                  value={couponForm.code}
                                  onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                                  placeholder="es. EM-SUMMER25"
                                  className="rounded-xl border-neutral-200 focus:ring-emerald-600 font-mono uppercase flex-1"
                                />
                                <Button type="button" variant="outline" size="icon" onClick={() => setCouponForm((f) => ({ ...f, code: generateCouponCode() }))} className="rounded-xl border-neutral-200 shrink-0" title="Genera codice">
                                  <Tag className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Type */}
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Tipo Sconto</Label>
                              <div className="grid grid-cols-2 gap-2">
                                {(["percentage", "fixed"] as const).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setCouponForm((f) => ({ ...f, discount_type: t }))}
                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                                      couponForm.discount_type === t
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                                    }`}
                                  >
                                    {t === "percentage" ? <><Percent className="w-4 h-4" /> Percentuale</> : <><DollarSign className="w-4 h-4" /> Fisso (€)</>}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Value */}
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">
                                Valore * {couponForm.discount_type === "percentage" ? "(%)" : "(€)"}
                              </Label>
                              <Input
                                type="number"
                                value={couponForm.value}
                                onChange={(e) => setCouponForm((f) => ({ ...f, value: e.target.value }))}
                                placeholder={couponForm.discount_type === "percentage" ? "es. 15" : "es. 10.00"}
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>

                            {/* Valid until */}
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Scadenza (opzionale)</Label>
                              <Input
                                type="date"
                                value={couponForm.valid_until}
                                onChange={(e) => setCouponForm((f) => ({ ...f, valid_until: e.target.value }))}
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>

                            {/* Usage limit */}
                            <div>
                              <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Limite Utilizzi (opzionale)</Label>
                              <Input
                                type="number"
                                value={couponForm.usage_limit}
                                onChange={(e) => setCouponForm((f) => ({ ...f, usage_limit: e.target.value }))}
                                placeholder="Illimitato"
                                className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                              />
                            </div>

                            {/* Active toggle */}
                            <div className="flex items-center justify-between py-3 px-4 bg-neutral-50 rounded-xl">
                              <div>
                                <p className="text-sm font-medium text-neutral-900">Coupon Attivo</p>
                                <p className="text-xs text-neutral-400">Utilizzabile dai clienti</p>
                              </div>
                              <Switch
                                checked={couponForm.is_active}
                                onCheckedChange={(v) => setCouponForm((f) => ({ ...f, is_active: v }))}
                                className="data-[state=checked]:bg-emerald-700"
                              />
                            </div>
                          </div>
                          <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
                            <Button variant="outline" onClick={() => setCouponDrawerOpen(false)} className="flex-1 rounded-xl border-neutral-200">Annulla</Button>
                            <Button onClick={handleCouponSubmit} disabled={couponSubmitting} className="flex-1 bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl">
                              {couponSubmitting ? "Salvataggio..." : editingCoupon ? "Aggiorna" : "Crea Coupon"}
                            </Button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}


              {section === "scanner" && (
                <motion.div
                  key="scanner"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6">
                    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-semibold text-neutral-900">
                      Scanner Hub
                    </h2>
                    <p className="text-sm text-neutral-400 mt-0.5">{scannerRequests.length} scansioni totali</p>
                  </div>

                  {scannerRequests.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                      <ScanSearch className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                      <p className="text-sm text-neutral-400">Nessuna scansione ancora</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {scannerRequests.map((scan) => {
                        const diag = typeof scan.diagnosis_result === "string"
                          ? (() => { try { return JSON.parse(scan.diagnosis_result); } catch { return { summary: scan.diagnosis_result }; } })()
                          : scan.diagnosis_result || {};
                        const summary = diag?.summary || diag?.diagnosi || diag?.description || (typeof scan.diagnosis_result === "string" ? scan.diagnosis_result : "—");
                        const score = scan.sustainability_score;
                        const scoreColor = !score ? "bg-neutral-100 text-neutral-500"
                          : score >= 71 ? "bg-emerald-100 text-emerald-800"
                          : score >= 26 ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-700";

                        return (
                          <button
                            key={scan.id}
                            onClick={() => setSelectedScan(scan)}
                            className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow text-left group"
                          >
                            {/* Thumbnail */}
                            <div className="h-36 bg-neutral-100 relative overflow-hidden">
                              {scan.image_url ? (
                                <img src={scan.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ScanSearch className="w-8 h-8 text-neutral-300" />
                                </div>
                              )}
                              {score != null && score > 0 && (
                                <span className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full ${scoreColor}`}>
                                  {score}/100
                                </span>
                              )}
                            </div>
                            {/* Info */}
                            <div className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">{scan.input_type}</span>
                                <span className="text-[10px] text-neutral-300">·</span>
                                <span className="text-[10px] text-neutral-400">
                                  {new Date(scan.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-700 line-clamp-2 break-words">{typeof summary === "string" ? summary : JSON.stringify(summary).slice(0, 120)}</p>
                              {scan.material && <p className="text-xs text-neutral-400 mt-1.5">Materiale: {scan.material}</p>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Scanner Detail Drawer */}
                  <AnimatePresence>
                    {selectedScan && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                          onClick={() => setSelectedScan(null)}
                        />
                        <motion.div
                          initial={{ x: "100%" }}
                          animate={{ x: 0 }}
                          exit={{ x: "100%" }}
                          transition={{ type: "spring", damping: 30, stiffness: 300 }}
                          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col"
                        >
                          <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                            <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900">
                              Dettaglio Scansione
                            </h3>
                            <button onClick={() => setSelectedScan(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors">
                              <X className="w-4 h-4 text-neutral-500" />
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            {/* Image */}
                            {selectedScan.image_url && (
                              <div className="rounded-xl overflow-hidden border border-neutral-200">
                                <img src={selectedScan.image_url} alt="" className="w-full h-48 object-cover" />
                              </div>
                            )}

                            {/* Score */}
                            {selectedScan.sustainability_score != null && selectedScan.sustainability_score > 0 && (
                              <div className="flex items-center gap-3">
                                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold ${
                                  selectedScan.sustainability_score >= 71 ? "bg-emerald-100 text-emerald-800"
                                  : selectedScan.sustainability_score >= 26 ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-700"
                                }`}>
                                  {selectedScan.sustainability_score}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-neutral-900">Punteggio Sostenibilità</p>
                                  <p className="text-xs text-neutral-400">
                                    {selectedScan.sustainability_score >= 71 ? "Eccellenza Sostenibile"
                                    : selectedScan.sustainability_score >= 26 ? "Scelta Consapevole"
                                    : "Da Rivalutare"}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Meta */}
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { label: "Tipo Input", value: selectedScan.input_type },
                                { label: "Materiale", value: selectedScan.material },
                                { label: "Brand", value: selectedScan.brand },
                                { label: "Tipo Capo", value: selectedScan.garment_type },
                                { label: "Data", value: new Date(selectedScan.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
                              ].filter(({ value }) => value).map(({ label, value }) => (
                                <div key={label} className="bg-neutral-50 rounded-xl px-3 py-2.5">
                                  <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">{label}</p>
                                  <p className="text-sm text-neutral-900 font-medium">{value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Diagnosis */}
                            {selectedScan.diagnosis_result && (
                              <div>
                                <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Diagnosi Completa</Label>
                                <div className="bg-neutral-50 rounded-xl p-4 text-sm text-neutral-700 break-words whitespace-pre-wrap max-h-80 overflow-y-auto">
                                  {typeof selectedScan.diagnosis_result === "string"
                                    ? selectedScan.diagnosis_result
                                    : JSON.stringify(selectedScan.diagnosis_result, null, 2)}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

            </AnimatePresence>
          </main>

          </>)}
        </div>

      {/* ══ Product Drawer (rendered outside iPad, overlays it) ════════════════ */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                <h3 style={{ fontFamily: "var(--font-serif)" }} className="text-lg font-semibold text-neutral-900">
                  {editingProduct ? "Modifica Prodotto" : "Nuovo Prodotto"}
                </h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors"
                >
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* ── Multi-image upload ─────────────────────────────────── */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                    Immagini Prodotto ({imageItems.length})
                  </Label>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingOver(false);
                      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
                    }}
                    className={`relative w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      isDraggingOver
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-neutral-200 bg-neutral-50 hover:border-emerald-300 hover:bg-emerald-50"
                    }`}
                  >
                    <Upload className="w-5 h-5 text-neutral-300 mb-1.5" />
                    <p className="text-xs text-neutral-400">Trascina qui le foto o clicca per selezionarle</p>
                    <p className="text-[10px] text-neutral-300 mt-0.5">Puoi caricare più file contemporaneamente</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
                  />

                  {/* Mini gallery */}
                  {imageItems.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {imageItems.map((img, index) => (
                        <div
                          key={img.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={() => { dragIndexRef.current = null; }}
                          className="relative group aspect-square rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 cursor-grab active:cursor-grabbing"
                        >
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                          {/* Overlay controls */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                              className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                            <GripVertical className="w-4 h-4 text-white/80" />
                          </div>
                          {/* Primary badge */}
                          {index === 0 && (
                            <span className="absolute top-1 left-1 text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-medium">
                              Cover
                            </span>
                          )}
                        </div>
                      ))}
                      {/* Add more button */}
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                      >
                        <ImageIcon className="w-4 h-4 text-neutral-300" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Nome *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="es. Abito Smeraldo"
                    className="rounded-xl border-neutral-200 focus:ring-emerald-600"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Descrizione</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Descrizione del prodotto..."
                    rows={3}
                    className="rounded-xl border-neutral-200 resize-none focus:ring-emerald-600"
                  />
                </div>

                {/* Price row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Prezzo (€) *</Label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="0.00"
                      className="rounded-xl border-neutral-200"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Prezzo Scontato (€)</Label>
                    <Input
                      type="number"
                      value={form.sale_price}
                      onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))}
                      placeholder="Opzionale"
                      className="rounded-xl border-neutral-200"
                    />
                  </div>
                </div>

                {/* Taglie disponibili + stock per ogni taglia */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">
                      Taglie disponibili
                    </Label>
                    <Input
                      value={form.sizes}
                      onChange={(e) => {
                        const newSizes = e.target.value;
                        const arr = parseSizesInput(newSizes);
                        setForm((f) => {
                          // Mantieni lo stock esistente per le taglie ancora presenti.
                          const next: Record<string, string> = {};
                          arr.forEach((s) => {
                            next[s] = f.stockMap[s] ?? "0";
                          });
                          return { ...f, sizes: newSizes, stockMap: next };
                        });
                      }}
                      placeholder="es. XS, S, M, L, XL  oppure  XS/S, S/M, M/L"
                      className="rounded-xl border-neutral-200"
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Separa le taglie con la virgola. Per ogni taglia inserita comparirà un campo stock qui sotto.
                    </p>
                  </div>

                  {(() => {
                    const sizesList = parseSizesInput(form.sizes);
                    const total = sizesList.reduce(
                      (sum, s) => sum + (parseInt(form.stockMap[s] ?? "0") || 0),
                      0,
                    );
                    if (sizesList.length === 0) {
                      return (
                        <p className="text-xs text-neutral-400 italic">
                          Aggiungi almeno una taglia per definire lo stock.
                        </p>
                      );
                    }
                    return (
                      <div>
                        <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">
                          Stock per taglia
                          <span className="ml-2 text-emerald-600 normal-case font-normal">
                            (totale collezione: {total})
                          </span>
                        </Label>
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${Math.min(sizesList.length, 4)}, minmax(0,1fr))` }}
                        >
                          {sizesList.map((size) => (
                            <div key={size}>
                              <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1 truncate" title={size}>
                                {size}
                              </p>
                              <Input
                                type="number"
                                min={0}
                                value={form.stockMap[size] ?? "0"}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    stockMap: { ...f.stockMap, [size]: e.target.value },
                                  }))
                                }
                                className="rounded-xl border-neutral-200"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Collezione</Label>
                    <select
                      value={form.collection_id}
                      onChange={(e) => {
                        const colId = e.target.value;
                        const col = collections.find((c) => c.id === colId);
                        setForm((f) => ({
                          ...f,
                          collection_id: colId,
                          category: col ? col.name : f.category,
                        }));
                      }}
                      className="w-full h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="">— Seleziona collezione —</option>
                      {collections.filter((c) => c.is_active).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Fabric */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Composizione Tessuto</Label>
                  <Input
                    value={form.fabric_details}
                    onChange={(e) => setForm((f) => ({ ...f, fabric_details: e.target.value }))}
                    placeholder="es. 100% Lino Biologico"
                    className="rounded-xl border-neutral-200"
                  />
                </div>

                {/* Shipping */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Info Spedizione</Label>
                  <Input
                    value={form.shipping_info}
                    onChange={(e) => setForm((f) => ({ ...f, shipping_info: e.target.value }))}
                    placeholder="es. Spedizione gratuita in 2-3 giorni"
                    className="rounded-xl border-neutral-200"
                  />
                </div>

                {/* Stripe Payment Link */}
                <div>
                  <Label className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 block">Link Pagamento Stripe</Label>
                  <Input
                    value={form.stripe_payment_link}
                    onChange={(e) => setForm((f) => ({ ...f, stripe_payment_link: e.target.value }))}
                    placeholder="https://buy.stripe.com/..."
                    className="rounded-xl border-neutral-200"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1.5">Se presente, sostituisce il carrello con il bottone "Acquista ora" che porta direttamente al checkout Stripe.</p>
                </div>

                {/* Visibilità + vetrina.
                    Mappatura: visibile off = draft; visibile on + vetrina on =
                    showcase; visibile on + vetrina off = active. */}
                <div className="flex items-center justify-between py-3 px-4 bg-neutral-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Prodotto visibile</p>
                    <p className="text-xs text-neutral-400">Se spento resta in bozza: non compare da nessuna parte sul sito.</p>
                  </div>
                  <Switch
                    checked={form.status !== "draft"}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, status: v ? "active" : "draft" }))
                    }
                    className="data-[state=checked]:bg-emerald-700"
                  />
                </div>

                <div
                  className={`flex items-center justify-between py-3 px-4 rounded-xl mt-3 ${
                    form.status === "draft" ? "bg-neutral-50/60 opacity-50" : "bg-neutral-50"
                  }`}
                >
                  <div className="pr-4">
                    <p className="text-sm font-medium text-neutral-900">Solo vetrina (non acquistabile)</p>
                    <p className="text-xs text-neutral-400">
                      Le foto si vedono e scorrono nelle collezioni, ma la scheda non si apre
                      e non si vedono prezzo né disponibilità. Il capo non può essere comprato.
                    </p>
                  </div>
                  <Switch
                    checked={form.status === "showcase"}
                    disabled={form.status === "draft"}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, status: v ? "showcase" : "active" }))
                    }
                    className="data-[state=checked]:bg-amber-600"
                  />
                </div>
              </div>

              {/* Drawer footer */}
              <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDrawerOpen(false)}
                  className="flex-1 rounded-xl border-neutral-200"
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-emerald-950 hover:bg-emerald-900 text-white rounded-xl"
                >
                  {submitting ? "Salvataggio..." : editingProduct ? "Aggiorna" : "Crea Prodotto"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-redirect a /login quando middleware non ha già fatto il lavoro
// (es. cookie stantio, race condition). Niente login form duplicata.
function AdminRedirectGuard({ mode }: { mode: "unauthenticated" | "not-admin" }) {
  useEffect(() => {
    const target =
      mode === "not-admin"
        ? "/profilo?error=not_admin"
        : "/login?redirectTo=/admin";
    // Piccolo delay per evitare flash + permettere a Supabase di settle
    const t = setTimeout(() => {
      window.location.href = target;
    }, 300);
    return () => clearTimeout(t);
  }, [mode]);

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-neutral-50">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-emerald-200 border-t-emerald-700 animate-spin" />
        <p className="text-sm text-neutral-500">
          {mode === "not-admin" ? "Account non autorizzato, ti rimando al profilo…" : "Reindirizzamento al login…"}
        </p>
      </div>
    </div>
  );
}
