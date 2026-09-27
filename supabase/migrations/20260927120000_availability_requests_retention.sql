-- ═══════════════════════════════════════════════════════════════════════════
-- Conservazione delle richieste di disponibilità: 12 mesi dalla chiusura
--
-- L'informativa privacy (§5) dichiara: "Le richieste di disponibilità sono
-- conservate per 12 mesi dalla chiusura della richiesta". Senza questo file
-- quella frase sarebbe una promessa che il sistema non mantiene: nessuno
-- cancellerebbe mai niente.
--
-- Va applicata DOPO 20260924120000_availability_requests.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Quando è stata chiusa davvero.
--    Non basta updated_at: cambia a ogni modifica, anche a una nota corretta
--    sei mesi dopo, e sposterebbe in avanti il termine di cancellazione.
ALTER TABLE public.availability_requests
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.availability_requests.closed_at IS
  'Istante in cui la richiesta è passata a ''chiusa''. NULL se è ancora aperta.
   Da qui decorrono i 12 mesi di conservazione dichiarati nell''informativa.';

-- Righe già chiuse prima di questa migrazione: si usa updated_at come stima.
UPDATE public.availability_requests
   SET closed_at = updated_at
 WHERE status = 'chiusa' AND closed_at IS NULL;

-- 2) closed_at si mantiene da solo.
CREATE OR REPLACE FUNCTION public.availability_requests_track_closed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'chiusa' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'chiusa') THEN
    NEW.closed_at = now();
  ELSIF NEW.status <> 'chiusa' THEN
    -- Riaperta: il conto alla rovescia si azzera.
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_requests_track_closed_at ON public.availability_requests;
CREATE TRIGGER availability_requests_track_closed_at
  BEFORE INSERT OR UPDATE OF status ON public.availability_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.availability_requests_track_closed_at();

-- 3) La cancellazione vera e propria.
--    SECURITY DEFINER perché deve poter cancellare a prescindere dalla RLS,
--    ma non è eseguibile da nessun ruolo pubblico: la chiama solo lo scheduler.
CREATE OR REPLACE FUNCTION public.purge_expired_availability_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.availability_requests
   WHERE status = 'chiusa'
     AND closed_at IS NOT NULL
     AND closed_at < now() - interval '12 months';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_availability_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_availability_requests() FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_availability_requests() FROM authenticated;

COMMENT ON FUNCTION public.purge_expired_availability_requests() IS
  'Cancella le richieste chiuse da oltre 12 mesi, come dichiarato
   nell''informativa privacy §5. Ritorna il numero di righe cancellate.';

-- 4) Schedulazione notturna, se pg_cron c'è.
--    Se non c'è, la funzione resta pronta ma NON parte da sola: il blocco lo
--    dice a voce alta invece di far credere che il problema sia risolto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-availability-requests') THEN
      PERFORM cron.unschedule('purge-availability-requests');
    END IF;
    PERFORM cron.schedule(
      'purge-availability-requests',
      '30 3 * * *',
      'SELECT public.purge_expired_availability_requests();'
    );
    RAISE NOTICE 'OK — pulizia schedulata ogni notte alle 03:30 UTC.';
  ELSE
    RAISE NOTICE 'ATTENZIONE — pg_cron non risulta installato. La funzione esiste ma NON viene eseguita automaticamente: i 12 mesi dichiarati in informativa non verrebbero rispettati. Abilitare pg_cron da Database > Extensions e rieseguire SOLO questo blocco DO.';
  END IF;
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICHE (dopo il COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════

-- La schedulazione è attiva?
-- SELECT jobname, schedule, command, active FROM cron.job
--  WHERE jobname = 'purge-availability-requests';

-- Prova a mano, senza aspettare la notte (ritorna quante ne ha cancellate):
-- SELECT public.purge_expired_availability_requests();

-- Nessun ruolo pubblico può chiamarla:
-- SELECT has_function_privilege('anon',          'public.purge_expired_availability_requests()', 'EXECUTE') AS anon_puo,
--        has_function_privilege('authenticated', 'public.purge_expired_availability_requests()', 'EXECUTE') AS auth_puo;
--   attesi: false, false


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════

-- BEGIN;
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
--      AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-availability-requests') THEN
--     PERFORM cron.unschedule('purge-availability-requests');
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.purge_expired_availability_requests();
-- DROP TRIGGER IF EXISTS availability_requests_track_closed_at ON public.availability_requests;
-- DROP FUNCTION IF EXISTS public.availability_requests_track_closed_at();
-- ALTER TABLE public.availability_requests DROP COLUMN IF EXISTS closed_at;
-- COMMIT;
