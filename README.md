# Gestione Cantieri e Squadre

App semplice per gestire, giorno per giorno, quali operai lavorano in quale cantiere, con orari di inizio/fine — pensata per chi deve poi fare le ore a fine mese.

## Come funziona

- **I capisquadra** aprono l'app dal telefono, selezionano il proprio nome (nessuna password) e da lì:
  - aggiungono operai alla squadra di oggi scegliendoli da una lista e indicando il cantiere;
  - possono **cambiare cantiere** a un operaio durante la giornata (registra automaticamente l'orario);
  - possono **rimuovere** un operaio (es. malattia, emergenza, serve altrove), registrando l'orario di uscita;
  - possono chiudere la giornata per tutta la squadra con un solo tasto.
- **L'ufficio** accede con una password a un pannello dedicato (`/admin-login.html`) per:
  - gestire l'elenco dei dipendenti (e indicare chi è anche caposquadra);
  - gestire l'elenco dei cantieri;
  - vedere il **report ore** per dipendente/cantiere/mese ed esportarlo in CSV (apribile in Excel) per fare le ore a fine mese.

L'app impedisce che uno stesso operaio venga assegnato a due squadre/cantieri contemporaneamente nello stesso giorno: bisogna prima rimuoverlo dalla squadra precedente.

## Caratteristiche tecniche (per chi se ne occupa)

Questa applicazione è scritta in puro Node.js, **senza alcuna dipendenza esterna da installare** (niente `npm install` di librerie): usa solo i moduli integrati in Node.js, incluso il database SQLite integrato (`node:sqlite`, richiede Node.js 22.5 o superiore). Questo la rende estremamente facile da distribuire e mantenere: basta Node.js installato, nessun'altra configurazione.

I dati sono salvati in un singolo file SQLite (`data/cantieri.db`). Va fatto un backup periodico di questo file (vedi sotto).

## Avvio in locale (per provarla)

```bash
node seed.js      # opzionale: inserisce dipendenti e cantieri di esempio
node server.js
```

Poi apri il browser su `http://localhost:3000`.

Per impostare la password dell'ufficio, crea un file `.env` (puoi copiare `.env.example`) con:

```
ADMIN_PASSWORD=la-tua-password
PORT=3000
```

**Password di default se non viene impostata nulla: `cantieri2026` — cambiala prima di andare online.**

## Come metterla online gratis (per chi non ha già un server)

L'app gira con un singolo comando (`node server.js`) e salva i dati in un file. Per essere raggiungibile da internet (i capisquadra sono in cantiere, non in ufficio) serve un servizio che tenga il programma sempre attivo. Ecco la strada più semplice e gratuita:

### Opzione consigliata: Render.com (livello gratuito/economico)

1. Crea un account gratuito su [render.com](https://render.com) e collega il tuo account GitHub.
2. Carica questa cartella in un repository GitHub (anche privato).
3. Su Render scegli "New +" → "Web Service", seleziona il repository.
4. Impostazioni di base:
   - **Build command**: lascia vuoto (non serve, non ci sono dipendenze da installare)
   - **Start command**: `node server.js`
   - **Variabili d'ambiente**: aggiungi `ADMIN_PASSWORD` con la password che vuoi usare
5. Per non perdere i dati ad ogni riavvio, aggiungi un **Persistent Disk** (Render lo offre a pochi euro al mese) montato sulla cartella `data/`. Questo è il solo costo eventuale: l'hosting in sé può rimanere sul piano gratuito, ma per i dati persistenti serve il disco.

In alternativa, se preferite **zero costi anche per il disco**, si può usare [Fly.io](https://fly.io) (offre macchine gratuite con volumi persistenti gratuiti fino a 3GB) — la procedura è simile: si collega il repository, si configura `node server.js` come comando di avvio, si crea un volume e si monta su `data/`.

### Alternativa: un PC/NAS sempre acceso in ufficio

Se preferite non usare servizi esterni, l'app può girare anche su un PC o NAS già presente in ufficio sempre acceso, raggiungibile da internet tramite il vostro router (serve aprire una porta o un servizio come Cloudflare Tunnel/Tailscale per renderlo accessibile ai capisquadra fuori sede in sicurezza, senza esporre direttamente il PC su internet). Se preferite questa strada, possiamo organizzare i passaggi insieme quando sarete pronti.

## Backup dei dati

Il file `data/cantieri.db` contiene tutta la cronologia di squadre, cantieri e orari. Conviene fare una copia periodica (anche solo scaricandolo via FTP/pannello dell'hosting una volta a settimana) così da non perdere lo storico delle ore lavorate.

## Struttura del progetto

```
cantieri-app/
  server.js        -> server web e tutte le API
  db.js             -> definizione del database e delle tabelle
  seed.js           -> dati di esempio (solo per provare l'app)
  public/           -> tutte le pagine che vedono gli utenti
    home.html         (scelta del caposquadra)
    squadra.html      (gestione della squadra di oggi)
    admin-login.html  (accesso ufficio)
    admin.html        (gestione dipendenti e cantieri)
    admin-report.html (report ore ed esportazione CSV)
  data/             -> il database (creato automaticamente al primo avvio)
```

## Possibili miglioramenti futuri

Alcune idee, da valutare in base alle esigenze reali una volta usata l'app per qualche settimana:

- invio automatico via email del report mensile all'ufficio;
- geolocalizzazione per confermare che il caposquadra sia effettivamente nel cantiere selezionato;
- notifiche se un cantiere resta senza nessuna squadra assegnata per più giorni;
- gestione di permessi/ferie pianificati in anticipo, non solo segnalati in giornata.
