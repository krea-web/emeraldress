-- ═══════════════════════════════════════════════════════════════════════════
-- Terzo stato prodotto: 'showcase' (vetrina)
--
-- Un capo in vetrina SI VEDE — le foto scorrono nelle collezioni e nel viewer
-- a tutto schermo — ma la scheda articolo non si apre e non si mostrano prezzo
-- né disponibilità.
--
-- Perché un terzo valore di `status` e non una colonna booleana:
-- `src/app/api/checkout/route.ts:125` è già `p.status !== "active"`, quindi un
-- capo in vetrina è NON acquistabile senza scrivere una riga di codice. Con un
-- booleano bisognerebbe ricordarsi di aggiungere il controllo, e dimenticarlo
-- lì significherebbe vendere un capo che non è in vendita.
--
-- `is_active` NON viene toccata: è un residuo mai letto né scritto (tutti gli
-- `is_active` del codice riguardano collections, coupons e il promo banner).
-- Si rimuove in un intervento separato.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Backfill PRIMA di tutto il resto.
--    È il vero rischio di questa migrazione: una riga con status NULL o fuori
--    dominio sparirebbe dal sito appena arrivano i filtri allow-list
--    (.in("status", ['active','showcase'])), e il vincolo del punto 3
--    fallirebbe comunque su dati sporchi.
UPDATE public.products
   SET status = 'active'
 WHERE status IS NULL
    OR status NOT IN ('active', 'draft', 'showcase');

-- 2) Default + NOT NULL: da qui in avanti nessuna riga può tornare NULL.
ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.products ALTER COLUMN status SET NOT NULL;

-- 3) Dominio chiuso ai tre stati.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'draft', 'showcase'));

-- 4) Documentazione della colonna.
COMMENT ON COLUMN public.products.status IS
  'Stato di pubblicazione del capo. Tre valori:
   - active   : visibile e acquistabile;
   - showcase : vetrina. Visibile con le foto (collezioni, home, viewer a tutto
                schermo), ma la scheda /product/[slug] risponde 307 verso
                /collezioni e non si mostrano prezzo né disponibilità.
                Non acquistabile: /api/checkout accetta solo ''active'';
   - draft    : invisibile al pubblico (404 sulla scheda, escluso da sitemap,
                collezioni, home e sostenibilità).
   Le query pubbliche usano un allow-list esplicito, mai NOT IN / <>.';

COMMIT;
