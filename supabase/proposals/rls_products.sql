-- ═══════════════════════════════════════════════════════════════════════════
--  RLS su public.products — PASSO SEPARATO E SUCCESSIVO AL DEPLOY
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠️  QUESTO FILE NON È UNA MIGRATION. Sta di proposito fuori da
--      supabase/migrations/ così `supabase db push` NON lo applica.
--      Va eseguito a mano nel SQL editor, e solo dopo che il deploy della
--      modalità vetrina è in produzione e verificato.
--
--  Perché dopo e non prima: finché i filtri allow-list non sono live, la RLS
--  sarebbe l'unica cosa a nascondere le bozze, e un errore qui fa sparire il
--  catalogo dalla produzione — non lo degrada, lo fa sparire.
--
--  Contiene:
--    SEZIONE 0 — accertamenti preliminari (sola lettura, eseguire per primi)
--    SEZIONE 1 — script consigliato: due policy di lettura separate per ruolo,
--                nessun GRANT ad anon
--    SEZIONE 2 — variante con policy unica + GRANT EXECUTE su has_role
--    SEZIONE 3 — rollback, incluso l'unico comando da usare nel panico
--
--  Si esegue LA SEZIONE 1 **oppure** LA SEZIONE 2. Mai tutte e due.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 0 — Accertamenti preliminari. Sola lettura, non modifica niente.
-- ───────────────────────────────────────────────────────────────────────────

-- 0.1  La RLS su products è già attiva? Ci sono già policy?
--      (Dalle verifiche in sola lettura risulta di no, ma questa riga chiude
--      la questione: è l'unica prova diretta.)
SELECT c.relrowsecurity      AS rls_attiva,
       c.relforcerowsecurity AS rls_forzata,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'products') AS n_policy
  FROM pg_class c
 WHERE c.oid = 'public.products'::regclass;

-- 0.2  La firma ESATTA di has_role, che serve per il GRANT della Sezione 2.
--      Attesa: public.has_role(uuid, app_role) — confermata dall'uso in
--      20260515162545_fix_site_analytics_rls_policies.sql:31.
SELECT p.oid::regprocedure AS firma,
       p.prosecdef         AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'has_role';

-- 0.3  Chi può già eseguire has_role.
SELECT r.rolname,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puo_eseguire
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 CROSS JOIN (SELECT rolname FROM pg_roles
              WHERE rolname IN ('anon','authenticated','service_role')) r
 WHERE n.nspname = 'public' AND p.proname = 'has_role';


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 1 — CONSIGLIATA. Due policy di lettura separate per ruolo.
--
-- anon non chiama MAI has_role, quindi non serve nessun GRANT: la funzione
-- resta inaccessibile ai visitatori anonimi, com'è oggi.
--
-- È il pattern già adottato in casa: la migration
-- 20260515162545_fix_site_analytics_rls_policies.sql ha risolto esattamente
-- questo errore ("permission denied for function has_role", che dal 12 maggio
-- aveva azzerato site_analytics) restringendo la policy a `authenticated`
-- invece di grantare la funzione ad anon.
--
-- Il blocco DO finale si autoverifica come anon PRIMA del COMMIT: se anon
-- vede 0 prodotti, o se la chiamata a has_role dà errore di permessi, la
-- transazione si annulla da sola e in produzione non cambia nulla.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_anon_read   ON public.products;
DROP POLICY IF EXISTS products_auth_read   ON public.products;
DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS products_admin_all   ON public.products;

-- Lettura, visitatore non loggato: solo lo status. Nessun has_role.
CREATE POLICY products_anon_read ON public.products
  FOR SELECT TO anon
  USING (status IN ('active', 'showcase'));

-- Lettura, utente loggato: come sopra, più tutto il catalogo se è admin.
CREATE POLICY products_auth_read ON public.products
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'showcase')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Scrittura: solo admin. NON è opzionale — l'admin scrive dal browser con la
-- sessione utente, non con la service role. Senza questa policy il pannello
-- admin smette di salvare.
CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Autoverifica: cosa vede davvero un visitatore non loggato?
DO $$
DECLARE
  v_visibili integer;
  v_attesi   integer;
BEGIN
  SELECT count(*) INTO v_attesi
    FROM public.products WHERE status IN ('active', 'showcase');

  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_visibili FROM public.products;
  RESET ROLE;

  IF v_visibili <> v_attesi THEN
    RAISE EXCEPTION
      'STOP — anon vede % prodotti invece di %. Transazione annullata, la produzione non è stata toccata.',
      v_visibili, v_attesi;
  END IF;

  RAISE NOTICE 'OK — anon vede % prodotti su % pubblicabili.', v_visibili, v_attesi;
END $$;

COMMIT;


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 2 — VARIANTE con policy di lettura unica + GRANT EXECUTE.
--
-- Da usare SOLO al posto della Sezione 1, mai insieme.
--
-- Con questa forma di policy il GRANT è obbligatorio, non accessorio: anon
-- valuta la stessa USING dell'utente loggato, quindi chiama has_role, e senza
-- EXECUTE riceve 42501 "permission denied for function has_role" — cioè il
-- catalogo sparisce per TUTTI i visitatori non loggati.
--
-- Prezzo del GRANT: chi ha la anon key può chiamare has_role(<uuid>, 'admin')
-- e scoprire se un certo utente è admin, a patto di conoscerne già l'UUID.
-- È il motivo per cui la Sezione 1 è preferibile.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ⬇⬇ LA RIGA DECISIVA DI QUESTA VARIANTE ⬇⬇
-- Senza di essa la policy sotto chiama una funzione che anon non può
-- eseguire, e il catalogo sparisce per ogni visitatore non loggato.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_anon_read   ON public.products;
DROP POLICY IF EXISTS products_auth_read   ON public.products;
DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS products_admin_all   ON public.products;

CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    status IN ('active', 'showcase')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Stessa autoverifica: qui intercetta anche il GRANT dimenticato, perché
-- l'errore di permessi su has_role annulla la transazione.
DO $$
DECLARE
  v_visibili integer;
  v_attesi   integer;
BEGIN
  SELECT count(*) INTO v_attesi
    FROM public.products WHERE status IN ('active', 'showcase');

  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_visibili FROM public.products;
  RESET ROLE;

  IF v_visibili <> v_attesi THEN
    RAISE EXCEPTION
      'STOP — anon vede % prodotti invece di %. Transazione annullata, la produzione non è stata toccata.',
      v_visibili, v_attesi;
  END IF;

  RAISE NOTICE 'OK — anon vede % prodotti su % pubblicabili.', v_visibili, v_attesi;
END $$;

COMMIT;


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 3 — ROLLBACK
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1  PANICO. Il catalogo è sparito dal sito e serve rimetterlo ORA.
--      Una riga, effetto immediato, niente da disfare prima. Le policy
--      restano definite ma inerti: si ripuliscono con calma dopo.
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;

-- 3.2  Rollback completo, a mente fredda: riporta products esattamente allo
--      stato di prima (RLS disattivata, nessuna policy, nessun GRANT nuovo).
BEGIN;

ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_anon_read   ON public.products;
DROP POLICY IF EXISTS products_auth_read   ON public.products;
DROP POLICY IF EXISTS products_public_read ON public.products;
DROP POLICY IF EXISTS products_admin_all   ON public.products;

-- SOLO se era stata eseguita la SEZIONE 2. Da NON eseguire dopo la Sezione 1:
-- lì il GRANT non è mai stato dato, e revocarlo a vuoto non serve.
-- Attenzione a non revocarlo se nel frattempo qualcos'altro ha iniziato a
-- dipenderne.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

COMMIT;

-- 3.3  Conferma che si è tornati al punto di partenza.
SELECT c.relrowsecurity AS rls_attiva,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'products') AS n_policy
  FROM pg_class c
 WHERE c.oid = 'public.products'::regclass;
