"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, ArrowUpToLine } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LOGO_ED = "https://jtmbnmpggzbucmgglisw.supabase.co/storage/v1/object/public/emerald-asset/emeraldress-icon-ed.svg";

// ── Shimmer particles ─────────────────────────────────────────────────────────
// Generati solo lato client (Math.random a livello modulo causa hydration mismatch).
function useParticles(count = 12) {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; size: number; delay: number; duration: number }[]
  >([]);
  useEffect(() => {
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 4,
        duration: 2.5 + Math.random() * 3,
      })),
    );
  }, [count]);
  return particles;
}

// ── Google Icon ───────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// /login: gestisce login E registrazione (toggle in alto).
// Le ragazze che ci arrivavano non trovavano come registrarsi.
type AuthMode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();
  const particles = useParticles(12);

  // Modalita' iniziale: ?mode=signup forza la registrazione (link dalla navbar / banner).
  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [capsLock, setCapsLock] = useState(false);

  // Detect CAPS LOCK quando il cursore e' nel campo password (e/o globalmente
  // mentre l'input password e' montato).
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState && e.getModifierState("CapsLock"));
  };

  // Watchdog: la query user_roles a volte resta appesa subito dopo signIn
  // (JWT non ancora propagato al PostgREST), causando loader infinito.
  // Promise.race con timeout 3s.
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      p,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

  // Role-based redirect helper. Solo per signin: dopo signup l'utente non e'
  // mai admin, quindi va dritto a /profilo senza query.
  const redirectByRole = async (userId: string) => {
    const redirectTo = searchParams.get("redirectTo");
    if (redirectTo && redirectTo.startsWith("/")) {
      router.replace(redirectTo);
      return;
    }
    const roleData = await withTimeout(
      Promise.resolve(
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle()
          .then((r) => r.data),
      ),
      3000,
    );
    router.replace(roleData ? "/admin" : "/profilo");
  };

  // Redirect post-signup: salta totalmente la query user_roles (un account
  // appena creato non e' admin) per evitare il loader infinito visto in prod.
  const redirectAfterSignup = () => {
    const redirectTo = searchParams.get("redirectTo");
    router.replace(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/profilo");
  };

  // Auto-redirect se già autenticato all'arrivo (es. dopo OAuth callback)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setTimeout(() => redirectByRole(session.user.id), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      if (mode === "signin") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError || !data.user) {
          setError("Email o password non corretti. Se non hai ancora un account, premi 'Crea account' qui sopra.");
          return;
        }
        await redirectByRole(data.user.id);
      } else {
        // Signup: lunghezza minima password gestita da Supabase (default 6).
        if (password.length < 6) {
          setError("La password deve avere almeno 6 caratteri.");
          return;
        }
        const redirectTo = searchParams.get("redirectTo");
        const next = redirectTo && redirectTo.startsWith("/")
          ? `?next=${encodeURIComponent(redirectTo)}`
          : "";
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback${next}` },
        });
        if (signupError) {
          const msg = signupError.message.toLowerCase();
          if (msg.includes("registered") || msg.includes("already")) {
            setError("Questa email è già registrata. Passa ad 'Accedi'.");
          } else {
            setError(signupError.message);
          }
          return;
        }
        if (data.session) {
          // Autoconferma email attiva su Supabase → entra subito.
          // Skippiamo la query user_roles per evitare il caso loader-infinito.
          redirectAfterSignup();
        } else {
          setInfo("Account creato! Controlla la tua email (anche lo spam) per confermarlo.");
          setPassword("");
        }
      }
    } catch {
      setError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      // Il ritorno va conservato ATTRAVERSO il callback: Google non torna qui,
      // torna su /auth/callback, che sa leggere solo `?next=`. Senza questo, chi
      // entrava con Google finiva su /profilo e perdeva il capo che stava
      // chiedendo. Password e registrazione lo facevano gia'.
      const redirectTo = searchParams.get("redirectTo");
      const next =
        redirectTo && redirectTo.startsWith("/")
          ? `?next=${encodeURIComponent(redirectTo)}`
          : "";
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback${next}` },
      });
      if (oauthError) {
        setError("Accesso Google non disponibile. Riprova.");
        setIsLoading(false);
      }
    } catch {
      setError("Si è verificato un errore con Google.");
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!forgotEmail) {
      setError("Inserisci la tua email.");
      return;
    }
    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setInfo("Se l'email è registrata riceverai un link per reimpostare la password.");
    setForgotMode(false);
    setForgotEmail("");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden py-10"
      style={{ backgroundColor: "#e4ffec" }}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background:
              "radial-gradient(circle, rgba(52,211,153,0.9) 0%, rgba(16,185,129,0.3) 60%, transparent 100%)",
          }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.4, 0.5] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(52,211,153,0.08) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center mb-4"
          >
            {/* Logo icona ED in cima — coerente col brand luxury */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_ED}
              alt="Emeraldress"
              width={56}
              height={56}
              className="h-14 w-14 object-contain drop-shadow-sm"
            />
          </motion.div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-emerald-700/60 mb-3">
            Emeraldress
          </p>
          <h1
            className="text-3xl text-emerald-950"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400 }}
          >
            {mode === "signin" ? "Accesso" : "Crea il tuo account"}
          </h1>
          <div className="mt-3 mx-auto w-10 h-px bg-emerald-400/50" />
        </motion.div>

        {/* Toggle Accedi / Registrati — sempre visibile in cima */}
        <div className="grid grid-cols-2 gap-0 border border-emerald-200 rounded-lg overflow-hidden text-[11px] tracking-[0.2em] uppercase mb-5 bg-white/60">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
            }}
            className={`py-2.5 transition-colors font-medium ${
              mode === "signin"
                ? "bg-emerald-900 text-emerald-50"
                : "text-emerald-900/70 hover:bg-white"
            }`}
          >
            Accedi
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
            }}
            className={`py-2.5 transition-colors font-medium ${
              mode === "signup"
                ? "bg-emerald-900 text-emerald-50"
                : "text-emerald-900/70 hover:bg-white"
            }`}
          >
            Crea account
          </button>
        </div>

        <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/60 mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/60 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-950 placeholder:text-emerald-700/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300 transition-all"
                  placeholder="nome@example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-[10px] tracking-[0.25em] uppercase text-emerald-800/60 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "signup" ? 6 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={checkCaps}
                    onKeyUp={checkCaps}
                    onBlur={() => setCapsLock(false)}
                    className="w-full bg-white/60 border border-emerald-200 rounded-lg px-4 py-3 pr-11 text-sm text-emerald-950 placeholder:text-emerald-700/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300 transition-all"
                    placeholder={mode === "signin" ? "••••••••" : "Almeno 6 caratteri"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600/50 hover:text-emerald-700"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {capsLock && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-amber-700/90 font-medium"
                  >
                    <ArrowUpToLine size={11} strokeWidth={2} />
                    Maiuscolo attivo
                  </motion.p>
                )}
              </div>

              <SubmitButton
                isLoading={isLoading}
                label={mode === "signin" ? "Entra" : "Crea il mio account"}
                loadingLabel={mode === "signin" ? "Accesso in corso…" : "Creazione account…"}
              />
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setError(null);
                    setInfo(null);
                  }}
                  className="block w-full text-center text-[10px] tracking-[0.25em] uppercase text-emerald-800/60 hover:text-emerald-900 mt-2"
                >
                  Password dimenticata?
                </button>
              )}
              {mode === "signup" && (
                <p className="text-[10px] tracking-[0.15em] text-emerald-800/60 text-center mt-2 leading-relaxed px-2">
                  Creando un account accetti i nostri{" "}
                  <a href="/termini" className="underline hover:text-emerald-900">Termini</a> e la{" "}
                  <a href="/privacy" className="underline hover:text-emerald-900">Privacy Policy</a>.
                </p>
              )}
            </form>

            {forgotMode && (
              <motion.form
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleForgot}
                className="mt-4 p-4 bg-white/60 border border-emerald-200 rounded-lg space-y-3"
              >
                <p className="text-[10px] tracking-[0.25em] uppercase text-emerald-800/70">
                  Recupera password
                </p>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-950 focus:outline-none focus:border-emerald-500"
                  placeholder="La tua email"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2 rounded-lg text-[10px] tracking-[0.25em] uppercase font-medium bg-emerald-900 text-emerald-50 hover:bg-emerald-950 disabled:opacity-60"
                  >
                    Invia link
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotMode(false)}
                    className="px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-emerald-800/70 hover:text-emerald-900"
                  >
                    Annulla
                  </button>
                </div>
              </motion.form>
            )}
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs text-red-600/80 text-center tracking-wide"
          >
            {error}
          </motion.p>
        )}
        {info && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs text-emerald-700 text-center tracking-wide"
          >
            {info}
          </motion.p>
        )}

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-emerald-300/40" />
          <span className="text-[9px] tracking-[0.3em] uppercase text-emerald-800/50">
            oppure
          </span>
          <div className="flex-1 h-px bg-emerald-300/40" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-lg bg-white border border-emerald-200 text-sm text-emerald-950 hover:bg-emerald-50 hover:border-emerald-300 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          <GoogleIcon />
          <span className="tracking-wide font-medium">
            {mode === "signin" ? "Accedi con Google" : "Registrati con Google"}
          </span>
        </button>

        {/* Switch rapido fra le due modalita' (sotto Google, ben visibile) */}
        <p className="mt-5 text-center text-xs text-emerald-900/70">
          {mode === "signin" ? (
            <>
              Non hai un account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                className="underline font-medium text-emerald-800 hover:text-emerald-950"
              >
                Crealo qui
              </button>
            </>
          ) : (
            <>
              Hai già un account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="underline font-medium text-emerald-800 hover:text-emerald-950"
              >
                Accedi
              </button>
            </>
          )}
        </p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.7 }}
          className="mt-8 text-center text-[9px] tracking-[0.25em] uppercase text-emerald-800/35"
        >
          Area Emeraldress · Accesso sicuro
        </motion.p>
      </motion.div>
    </div>
  );
}

function SubmitButton({
  isLoading,
  label,
  loadingLabel,
}: {
  isLoading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="w-full mt-2 py-3 rounded-lg text-[11px] tracking-[0.25em] uppercase font-medium transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)",
        color: "#f0fdf4",
        boxShadow: "0 4px 20px rgba(5,150,105,0.25)",
      }}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 size={13} className="animate-spin" />
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
