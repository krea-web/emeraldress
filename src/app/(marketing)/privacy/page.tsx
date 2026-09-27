import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sulla privacy di Emeraldress: trattamento dei dati personali, finalità, base giuridica e diritti dell'interessato ai sensi del GDPR.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Legale"
      title="Privacy Policy"
      intro="La presente informativa descrive in modo trasparente come Emeraldress raccoglie, utilizza e protegge i dati personali dei propri utenti, in conformità al Regolamento (UE) 2016/679 (GDPR)."
      relatedLinks={[
        { to: "/", label: "Home", desc: "Torna al manifesto e all'esperienza Emeraldress.", eyebrow: "Inizio" },
        { to: "/termini", label: "Termini e Condizioni", desc: "Condizioni generali di vendita e d'uso del sito.", eyebrow: "Legale" },
        { to: "/faq", label: "FAQ & Spedizioni", desc: "Tempi di consegna, pagamenti, taglie e cura dei capi.", eyebrow: "Supporto" },
        { to: "/resi", label: "Politica di Reso", desc: "Diritto di recesso entro 14 giorni e procedura completa.", eyebrow: "Supporto" },
      ]}
    >
      <h2>1. Titolare del trattamento</h2>
      <p>
        Il titolare del trattamento dei dati personali è <strong>Emeraldress</strong>, attività
        operante esclusivamente online con riferimento territoriale in Olbia – Porto Cervo (Sardegna,
        Italia). Per qualsiasi richiesta relativa al trattamento dei dati è possibile contattare il
        titolare all&apos;indirizzo email{" "}
        <a href="mailto:emeraldresshop@gmail.com">emeraldresshop@gmail.com</a>.
      </p>

      <h2>2. Tipologie di dati raccolti</h2>
      <p>Emeraldress può raccogliere e trattare le seguenti categorie di dati:</p>
      <ul>
        <li>
          <strong>Dati di contatto e identificativi</strong>: nome, cognome, indirizzo email,
          numero di telefono, indirizzo di spedizione e fatturazione;
        </li>
        <li>
          <strong>Dati di acquisto</strong>: prodotti ordinati, taglia selezionata, importo,
          cronologia ordini;
        </li>
        <li>
          <strong>Dati di pagamento</strong>: gestiti integralmente dal processore Stripe;
          Emeraldress non memorizza i dati delle carte;
        </li>
        <li>
          <strong>Dati di navigazione</strong>: indirizzo IP, tipo di browser e dispositivo,
          pagine visitate, tempo di permanenza, raccolti tramite cookie e tecnologie analoghe;
        </li>
        <li>
          <strong>Dati forniti volontariamente</strong>: messaggi inviati tramite email o moduli
          di contatto, iscrizione alla newsletter.
        </li>
      </ul>

      <h2>3. Finalità e base giuridica del trattamento</h2>
      <p>I dati personali vengono trattati per le seguenti finalità:</p>
      <ol>
        <li>
          <strong>Esecuzione del contratto</strong> di acquisto: gestione dell&apos;ordine,
          spedizione, fatturazione, assistenza post-vendita (art. 6.1.b GDPR);
        </li>
        <li>
          <strong>Adempimento di obblighi di legge</strong>, fiscali e contabili (art. 6.1.c GDPR);
        </li>
        <li>
          <strong>Finalità di marketing diretto</strong>, invio newsletter, comunicazioni
          promozionali, previo consenso esplicito dell&apos;interessato (art. 6.1.a GDPR);
        </li>
        <li>
          <strong>Riscontro alle richieste di disponibilità</strong> su capi non acquistabili
          online, ivi comprese le misure precontrattuali adottate su richiesta
          dell&apos;interessato (art. 6.1.b GDPR);
        </li>
        <li>
          <strong>Analisi e miglioramento del sito</strong>, sicurezza e prevenzione di attività
          fraudolente, sulla base del legittimo interesse del titolare (art. 6.1.f GDPR).
        </li>
      </ol>

      <h2>4. Modalità del trattamento</h2>
      <p>
        I dati sono trattati con strumenti elettronici, mediante misure tecniche e organizzative
        adeguate a garantirne riservatezza, integrità e disponibilità, nel rispetto dei principi di
        liceità, minimizzazione e limitazione delle finalità.
      </p>

      <h2>5. Conservazione dei dati</h2>
      <p>
        I dati personali sono conservati per il tempo strettamente necessario al perseguimento
        delle finalità per cui sono stati raccolti e, in ogni caso, per i termini imposti dalla
        normativa fiscale e contabile vigente (di norma 10 anni per i documenti contabili). I dati
        di marketing sono conservati fino a revoca del consenso. Le richieste di disponibilità
        sono conservate per 12 mesi dalla chiusura della richiesta.
      </p>

      <h2>6. Comunicazione dei dati a terzi</h2>
      <p>I dati possono essere comunicati ai seguenti soggetti, in qualità di responsabili del trattamento:</p>
      <ul>
        <li>fornitori di servizi di pagamento (Stripe);</li>
        <li>corrieri e operatori logistici per la consegna degli ordini;</li>
        <li>fornitori di servizi tecnologici, hosting e infrastruttura cloud;</li>
        <li>consulenti fiscali, legali e contabili;</li>
        <li>autorità pubbliche, ove richiesto dalla legge.</li>
      </ul>
      <p>
        I dati non sono in alcun caso oggetto di vendita o cessione a terzi per finalità
        commerciali autonome.
      </p>

      <h2>7. Trasferimento extra-UE</h2>
      <p>
        Alcuni fornitori (es. infrastruttura cloud, processori di pagamento) possono trattare i
        dati anche al di fuori dell&apos;Unione Europea. In tali casi il trasferimento avviene nel
        rispetto delle garanzie previste dal GDPR (Clausole Contrattuali Standard o decisioni di
        adeguatezza della Commissione Europea).
      </p>

      <h2>8. Diritti dell&apos;interessato</h2>
      <p>In qualsiasi momento l&apos;interessato ha diritto a:</p>
      <ul>
        <li>accedere ai propri dati personali (art. 15 GDPR);</li>
        <li>richiederne la rettifica o la cancellazione (artt. 16 e 17 GDPR);</li>
        <li>limitare od opporsi al trattamento (artt. 18 e 21 GDPR);</li>
        <li>ricevere i propri dati in formato strutturato (portabilità, art. 20 GDPR);</li>
        <li>revocare in ogni momento il consenso prestato;</li>
        <li>proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).</li>
      </ul>
      <p>
        Le richieste possono essere inviate a{" "}
        <a href="mailto:emeraldresshop@gmail.com">emeraldresshop@gmail.com</a>.
      </p>

      <h2>9. Cookie</h2>
      <p>
        Il sito utilizza cookie tecnici necessari al funzionamento e, previo consenso, cookie
        analitici e di marketing. L&apos;utente può gestire le preferenze tramite le impostazioni del
        proprio browser o eventuali strumenti di consenso presenti nel sito.
      </p>

      <h2>10. Modifiche</h2>
      <p>
        Emeraldress si riserva il diritto di aggiornare la presente informativa per riflettere
        modifiche normative o organizzative. La versione vigente è sempre pubblicata in questa
        pagina con la data dell&apos;ultimo aggiornamento.
      </p>
    </LegalLayout>
  );
}
