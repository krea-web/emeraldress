-- ═══════════════════════════════════════════════════════════════════════════
-- Richieste di disponibilità sui capi in vetrina (status = 'showcase')
--
-- Un capo in vetrina si vede ma non si compra. Da qui passa l'unica azione
-- possibile su quei capi: "Richiedi disponibilità", che deposita nel
-- gestionale l'intenzione d'acquisto di QUEL capo in QUELLA taglia.
--
-- Serve essere registrati: senza user_id non si inserisce niente.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.availability_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- user_id CASCADE: se una persona cancella l'account, le sue richieste
  -- devono sparire con lei.
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- product_id nullable con SET NULL, non CASCADE: una richiesta è un contatto
  -- commerciale e non va persa insieme al prodotto. Se un capo viene
  -- cancellato la richiesta resta leggibile grazie a product_name, che è una
  -- fotografia apposta, e la cancellazione del capo non viene bloccata.
  product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,

  -- Fotografie del momento della richiesta: il capo può essere rinominato e
  -- il profilo può cambiare, ma la richiesta deve restare leggibile com'era.
  -- customer_email/customer_name sono scritti dal SERVER dalla sessione,
  -- mai da input del client: auth.users non è leggibile via PostgREST, e
  -- senza questa fotografia l'admin non potrebbe mostrare chi ha chiesto.
  product_name   text NOT NULL,
  customer_email text,
  customer_name  text,

  size   text NOT NULL,
  phone  text,
  note   text,

  status text NOT NULL DEFAULT 'nuova',

  CONSTRAINT availability_requests_status_check
    CHECK (status IN ('nuova', 'contattata', 'chiusa')),
  CONSTRAINT availability_requests_size_len
    CHECK (char_length(size) BETWEEN 1 AND 32),
  CONSTRAINT availability_requests_note_len
    CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT availability_requests_phone_len
    CHECK (phone IS NULL OR char_length(phone) <= 32)
);

CREATE INDEX IF NOT EXISTS availability_requests_user_id_idx
  ON public.availability_requests(user_id);

-- La lista dell'admin ordina per data e filtra per stato.
CREATE INDEX IF NOT EXISTS availability_requests_status_created_idx
  ON public.availability_requests(status, created_at DESC);

-- Una sola richiesta APERTA per (persona, capo, taglia). Parziale di
-- proposito: una volta chiusa o contattata, la stessa persona può richiedere
-- di nuovo lo stesso capo. Blocca il doppio click nel database e non solo
-- nella UI, che è l'unico punto in cui un doppio invio si ferma davvero.
--
-- Con product_id a NULL (capo cancellato) l'indice non vincola più nulla: in
-- PostgreSQL due NULL non sono considerati uguali. È il comportamento giusto,
-- quelle righe sono ormai solo storia.
CREATE UNIQUE INDEX IF NOT EXISTS availability_requests_one_open_per_size
  ON public.availability_requests(user_id, product_id, size)
  WHERE status = 'nuova';

CREATE OR REPLACE FUNCTION public.availability_requests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_requests_set_updated_at ON public.availability_requests;
CREATE TRIGGER availability_requests_set_updated_at
  BEFORE UPDATE ON public.availability_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.availability_requests_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- La lezione delle recensioni: là la policy admin era FOR ALL senza clausola
-- TO, quindi valeva per PUBLIC. Un visitatore anonimo la faceva scattare,
-- lei interrogava user_roles, user_roles chiamava has_role(), e anon non ha
-- il permesso di eseguirla: 42501, e le recensioni sparivano per tutti.
--
-- Qui ogni policy è ESPLICITAMENTE `TO authenticated`, e per anon non esiste
-- nessuna policy: un anonimo non legge, non scrive, e soprattutto non fa
-- scattare nessuna funzione.
ALTER TABLE public.availability_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS availability_requests_insert_own   ON public.availability_requests;
DROP POLICY IF EXISTS availability_requests_select_own   ON public.availability_requests;
DROP POLICY IF EXISTS availability_requests_select_admin ON public.availability_requests;
DROP POLICY IF EXISTS availability_requests_update_admin ON public.availability_requests;

-- Chi invia può inserire solo righe a proprio nome: seconda barriera dopo
-- la API route, che è già l'unica via d'ingresso.
CREATE POLICY availability_requests_insert_own
  ON public.availability_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Ognuno legge solo le proprie.
CREATE POLICY availability_requests_select_own
  ON public.availability_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- L'admin legge tutto e cambia lo stato. TO authenticated, mai public.
CREATE POLICY availability_requests_select_admin
  ON public.availability_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY availability_requests_update_admin
  ON public.availability_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── Autoverifica PRIMA del COMMIT ──────────────────────────────────────────
-- Si finge anon dentro la transazione. Due esiti da intercettare:
--   * se una policy facesse scattare has_role per anon, la SELECT
--     solleverebbe 42501 e la transazione si annullerebbe da sola: è
--     esattamente l'errore delle recensioni, preso in trappola qui;
--   * se anon riuscisse a leggere righe, la tabella sarebbe esposta.
DO $$
DECLARE
  v_viste integer;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_viste FROM public.availability_requests;
  RESET ROLE;

  IF v_viste <> 0 THEN
    RAISE EXCEPTION
      'STOP — anon legge % righe di availability_requests. Transazione annullata.',
      v_viste;
  END IF;

  RAISE NOTICE 'OK — anon vede 0 righe e non solleva errori di permesso.';
END $$;

COMMENT ON TABLE public.availability_requests IS
  'Richieste di disponibilità sui capi in vetrina (products.status = ''showcase'').
   Inserite solo via POST /api/availability-request, con la sessione dell''utente:
   mai con la service role. product_name, customer_email e customer_name sono
   fotografie scritte dal server al momento della richiesta.
   Indice unico parziale su (user_id, product_id, size) WHERE status = ''nuova'':
   una sola richiesta aperta per persona, capo e taglia.
   product_id è ON DELETE SET NULL: se il capo viene cancellato la richiesta
   resta e si legge da product_name. user_id è CASCADE: se la persona cancella
   l''account, le sue richieste spariscono con lei.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════

-- Panico: qualcosa non torna e serve tornare indietro subito.
-- ⚠️ DROP TABLE cancella anche le richieste già ricevute. Se ce ne sono,
--    salvarle prima:
--    CREATE TABLE public.availability_requests_backup AS
--      SELECT * FROM public.availability_requests;
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS availability_requests_set_updated_at ON public.availability_requests;
-- DROP FUNCTION IF EXISTS public.availability_requests_set_updated_at();
-- DROP TABLE IF EXISTS public.availability_requests;
-- COMMIT;

-- Solo le policy, lasciando la tabella e i dati al loro posto:
-- BEGIN;
-- DROP POLICY IF EXISTS availability_requests_insert_own   ON public.availability_requests;
-- DROP POLICY IF EXISTS availability_requests_select_own   ON public.availability_requests;
-- DROP POLICY IF EXISTS availability_requests_select_admin ON public.availability_requests;
-- DROP POLICY IF EXISTS availability_requests_update_admin ON public.availability_requests;
-- ALTER TABLE public.availability_requests DISABLE ROW LEVEL SECURITY;
-- COMMIT;

-- Verifica dello stato finale:
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'availability_requests';
