"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X } from "lucide-react";
import {
  grantAnalyticsConsent,
  denyAnalyticsConsent,
  applyStoredAnalyticsConsent,
} from "@/lib/analytics";

const STORAGE_KEY = "emeraldress_cookie_consent_v1";

type Consent = "accepted" | "rejected" | null;

export const getCookieConsent = (): Consent => {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(STORAGE_KEY) as Consent) ?? null;
};

const CookieBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Chi ha gia' scelto non rivede il banner, ma la sua scelta va comunque
    // riapplicata a ogni caricamento: i tracciatori ripartono da zero.
    applyStoredAnalyticsConsent();
    const t = setTimeout(() => {
      if (!getCookieConsent()) setVisible(true);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  const setChoice = (v: Exclude<Consent, null>) => {
    localStorage.setItem(STORAGE_KEY, v);
    if (v === "accepted") grantAnalyticsConsent();
    else denyAnalyticsConsent();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:bottom-6 md:max-w-md z-[60]"
          role="dialog"
          aria-live="polite"
          aria-label="Preferenze cookie"
        >
          <div className="relative bg-white border border-emerald-100 shadow-2xl shadow-emerald-900/10 rounded-2xl p-6 backdrop-blur">
            <button
              onClick={() => setChoice("rejected")}
              aria-label="Chiudi"
              className="absolute top-3 right-3 text-emerald-700/60 hover:text-emerald-950 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-emerald-600 mb-3">
              Privacy
            </p>
            <h2 className="font-serif text-emerald-950 text-xl mb-2 leading-tight">
              Rispettiamo la tua privacy
            </h2>
            <p className="font-sans text-sm text-emerald-900/75 leading-relaxed mb-5">
              Utilizziamo cookie tecnici essenziali e, previo consenso, cookie analitici per
              migliorare l&apos;esperienza. Leggi la nostra{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-emerald-700">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setChoice("accepted")}
                className="flex-1 py-3 bg-emerald-950 text-white font-sans text-[11px] tracking-[0.25em] uppercase hover:bg-emerald-800 transition-colors rounded-md"
              >
                Accetta tutti
              </button>
              <button
                onClick={() => setChoice("rejected")}
                className="flex-1 py-3 border border-emerald-200 text-emerald-950 font-sans text-[11px] tracking-[0.25em] uppercase hover:bg-[#e4ffec] transition-colors rounded-md"
              >
                Solo essenziali
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieBanner;
