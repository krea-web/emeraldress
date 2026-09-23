-- ═══════════════════════════════════════════════════════════════════════════
--  reviews — 401 "permission denied for function has_role" per i visitatori
--  non loggati. PASSO SEPARATO, DA NON ESEGUIRE ALLA CIECA.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠️  NON È UNA MIGRATION: sta fuori da supabase/migrations/ così
--      `supabase db push` non lo applica.
--
--  ⚠️  LA SEZIONE 1 È INCOMPLETA DI PROPOSITO. Va compilata dopo aver letto
--      l'output della SEZIONE 0: non conosco i nomi delle policy esistenti, e
--      droppare quella sbagliata romperebbe l'INVIO delle recensioni, non solo
--      la lettura.
--
--  Il difetto, misurato con la query esatta che gira su ogni scheda prodotto
--  (ProductReviews.tsx:160-165):
--      anon          -> HTTP 401  42501  permission denied for function has_role
--      service_role  -> HTTP 200  [{"id":"cb80aa9a-…","rating":5}]
--
--  Causa: una policy SELECT applicabile ad anon chiama public.has_role(), che
--  anon non può eseguire. In PostgreSQL le policy permissive dello stesso
--  comando sono in OR, quindi basta che UNA chiami has_role perché l'intera
--  SELECT fallisca per anon — nessun filtro sulla query lo evita.
--
--  Stesso difetto già visto e risolto il 15 maggio su site_analytics
--  (20260515162545_fix_site_analytics_rls_policies.sql), che aveva azzerato le
--  visite dal 12 maggio. La soluzione adottata allora, e riproposta qui:
--  separare le policy per ruolo, così anon non valuta mai has_role.
--  NON grantare has_role ad anon.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 0 — OBBLIGATORIA. Sola lettura. Eseguire e incollarmi l'output.
-- ───────────────────────────────────────────────────────────────────────────

-- 0.1  Le policy attuali su reviews: nomi, comando, ruoli, USING, WITH CHECK.
--      Serve per sapere QUALE droppare e quali lasciare stare (l'INSERT con
--      cui i clienti inviano le recensioni deve restare intatto).
SELECT policyname,
       cmd,
       roles,
       permissive,
       qual        AS using_expr,
       with_check  AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'reviews'
 ORDER BY cmd, policyname;

-- 0.2  Quali di quelle policy nominano has_role: sono le uniche da cambiare.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'reviews'
   AND (coalesce(qual, '') ILIKE '%has_role%'
        OR coalesce(with_check, '') ILIKE '%has_role%');

-- 0.3  Il quadro atteso dopo la fix, da usare come riferimento
--      nell'autoverifica: quante recensioni sono approvate e quante no.
--      (Al 23 settembre: 3 totali, 2 approvate, 1 no.)
SELECT count(*) FILTER (WHERE is_approved)        AS approvate,
       count(*) FILTER (WHERE NOT is_approved)    AS non_approvate,
       count(*)                                   AS totali
  FROM public.reviews;


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 1 — LA FIX. Compilare i <<< SEGNAPOSTO >>> con i dati della Sez. 0.
--
-- Principio: una policy di lettura per anon che NON nomina has_role, e una
-- per authenticated che può nominarlo. Nessun GRANT.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1.1  Rimuove SOLO la policy di lettura che oggi nomina has_role.
--      Sostituire con il nome esatto trovato in 0.2. Lasciare stare le policy
--      INSERT/UPDATE: servono all'invio delle recensioni e alla moderazione.
DROP POLICY IF EXISTS "<<< NOME DELLA POLICY SELECT TROVATA IN 0.2 >>>" ON public.reviews;

DROP POLICY IF EXISTS reviews_anon_read ON public.reviews;
DROP POLICY IF EXISTS reviews_auth_read ON public.reviews;

-- 1.2  Visitatore non loggato: vede solo le recensioni approvate.
--      Nessuna chiamata a has_role, quindi nessun 42501.
CREATE POLICY reviews_anon_read ON public.reviews
  FOR SELECT TO anon
  USING (is_approved = true);

-- 1.3  Utente loggato: le approvate, più le proprie anche se non ancora
--      approvate, più tutto se è admin.
--      Se la colonna che lega la recensione all'utente non si chiama `user_id`,
--      correggerla qui con quella vista in 0.1.
CREATE POLICY reviews_auth_read ON public.reviews
  FOR SELECT TO authenticated
  USING (
    is_approved = true
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 1.4  Autoverifica PRIMA del COMMIT: si finge anon dentro la transazione.
--      Intercetta i due modi di sbagliare — anon che non vede niente (401 o
--      policy troppo stretta) e anon che vede troppo (recensioni non ancora
--      moderate esposte al pubblico). In entrambi i casi annulla tutto.
DO $$
DECLARE
  v_viste     integer;
  v_approvate integer;
BEGIN
  SELECT count(*) INTO v_approvate FROM public.reviews WHERE is_approved;

  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_viste FROM public.reviews;
  RESET ROLE;

  IF v_viste <> v_approvate THEN
    RAISE EXCEPTION
      'STOP — anon vede % recensioni, le approvate sono %. Transazione annullata, la produzione non è stata toccata.',
      v_viste, v_approvate;
  END IF;

  RAISE NOTICE 'OK — anon vede % recensioni, esattamente le approvate.', v_viste;
END $$;

COMMIT;


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 2 — Verifica dall'esterno, dopo il COMMIT.
-- Da lanciare in un terminale, non qui: è il test che riproduce il difetto.
-- Deve tornare 200 con le recensioni approvate, non più 401.
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     "$SUPABASE_URL/rest/v1/reviews?select=id,rating&is_approved=eq.true"
--
-- E sulla scheda prodotto, con la console del browser aperta: dopo il fix del
-- 23 settembre un errore qui stampa "[reviews] load error:", quindi il
-- silenzio in console è di per sé una conferma.
-- ───────────────────────────────────────────────────────────────────────────


-- ───────────────────────────────────────────────────────────────────────────
-- SEZIONE 3 — ROLLBACK
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1  PANICO: le recensioni sono sparite o, peggio, sono comparse quelle non
--      moderate. Rimette lo stato precedente togliendo le due policy nuove.
--      ⚠️ Ricreare subito dopo la policy droppata in 1.1, con l'espressione
--      esatta letta in 0.1: finché non c'è, la lettura di reviews è chiusa.
BEGIN;
DROP POLICY IF EXISTS reviews_anon_read ON public.reviews;
DROP POLICY IF EXISTS reviews_auth_read ON public.reviews;
-- CREATE POLICY "<<< nome originale >>>" ON public.reviews
--   FOR SELECT TO <<< ruoli originali >>>
--   USING ( <<< using_expr originale, copiata da 0.1 >>> );
COMMIT;

-- 3.2  Ritorno allo stato di partenza: rileggere 0.1 e confrontare con
--      l'output salvato prima di iniziare. Devono coincidere.
