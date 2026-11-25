# Almagora – Come migliorare il progetto

Analisi del codice di `main` del 25 novembre 2026 (dopo la PR #2 su immagini e audio di Roma). Ogni punto indica **il problema**, **dove si trova** e **cosa fare**.
L’ordine è quello di priorità: prima la sicurezza, poi le funzioni promesse ma simulate, infine la qualità del codice.

---

## 1. Sicurezza e affidabilità (priorità alta)

### 1.1 Sincronizzazione dei profili senza protezione
- **Dove:** `server.ts`, endpoint `GET /api/sync/:syncCode` e `POST /api/sync/:syncCode`.
- **Problema:** chi conosce (o indovina) un codice di 6 caratteri può leggere *e sovrascrivere* il profilo di un altro utente, email compresa. Il `POST` accetta qualsiasi codice, anche inesistente, e qualsiasi contenuto. Il codice viene generato con `Math.random()`, che non è adatto a valori segreti.
- **Cosa fare:**
  - autenticazione vera (es. Supabase Auth, Firebase Auth o magic link via email);
  - in alternativa minima: codici monouso con scadenza, generati con `crypto.randomInt`, e `POST` consentito solo su codici già esistenti;
  - validare il corpo della richiesta con uno schema (es. `zod`).

### 1.2 Dati salvati solo in memoria
- **Dove:** `server.ts`, `const syncStore = new Map()`.
- **Problema:** al riavvio del server (o con più istanze su Cloud Run) tutti i profili sincronizzati spariscono.
- **Cosa fare:** un database. Per iniziare basta SQLite (`better-sqlite3`), poi Postgres.

### 1.3 Chiamate AI senza limiti
- **Dove:** tutti gli endpoint `/api/cicerone/*`.
- **Problema:** nessun limite di richieste: chiunque può generare costi Gemini illimitati. `express.json({ limit: '10mb' })` vale per tutti gli endpoint, non solo per la trascrizione audio.
- **Cosa fare:**
  - `express-rate-limit` per IP (e poi per utente);
  - cache delle narrazioni per `monumento + persona + lingua`: la stessa tappa non va rigenerata a ogni visita;
  - limite di 10 MB solo su `/api/cicerone/transcribe`, 100 KB sugli altri.

### 1.4 Input non validati nei prompt
- **Dove:** `/api/cicerone/narrate`, `/generate-tour`, `/ask`.
- **Problema:** `monumentName`, `city`, `theme`, `userInterests` finiscono nel prompt così come arrivano. Se `userInterests` non è un array, `.join()` lancia un’eccezione e la richiesta finisce silenziosamente nel fallback. Testi lunghissimi aumentano i costi.
- **Cosa fare:** controllare tipi e lunghezze massime di ogni campo; per le narrazioni dei tour curati, accettare solo ID di tappe conosciute.

---

## 2. Prodotto: mantenere le promesse

La descrizione dell’app (in `index.html` e `metadata.json`) promette funzioni che oggi sono simulate.

| Funzione promessa | Stato attuale | Cosa fare |
|---|---|---|
| **Navigazione GPS in tempo reale** | Nel codice non c’è `navigator.geolocation`: la posizione si muove solo con la “camminata simulata” (`App.tsx`). | `watchPosition` con permesso esplicito, poi riuso di `getDistanceMeters` per attivare le tappe. Tenere la simulazione come modalità demo. |
| **Percorsi offline** | Non c’è service worker: senza rete l’app non parte. “Scarica tour” mostra una barra di avanzamento simulata e aggiunge solo un ID alla lista. | Trasformarla in PWA (`vite-plugin-pwa`): cache di app, testi, MP3 e tile della mappa per i tour scaricati. |
| **Abbonamento Pro** | `handleUpgradeTier` cambia solo un valore locale: Pro gratis per tutti. | Stripe Checkout (web) o acquisti in-app, con verifica lato server e stato salvato nel database. |
| **Voce reale** | Registrazioni solo per Roma: l’introduzione e le tre clip del Colosseo (`recordedAudio.ts`). Tutte le altre tappe usano la voce sintetica. | Registrare le altre tappe di Roma seguendo `docs/testi-guida-vocale.md`, poi Padova. |
| **Latenza Bluetooth** | Il valore mostrato è casuale (`bluetoothService.ts`, `Math.random()`). | Toglierlo o mostrare solo dati misurati davvero. |
| **Multilingua** | Interfaccia solo in italiano; la trascrizione chiede sempre l’italiano anche se l’utente sceglie un’altra lingua. | Libreria i18n (es. `react-i18next`), inglese per primo; passare la lingua anche a `/transcribe`. |

---

## 3. Qualità del codice

### 3.1 `App.tsx` troppo grande
1.039 righe e 27 `useState` in un solo componente. Ogni modifica rischia effetti collaterali.
**Cosa fare:** estrarre hook dedicati (`useActiveTour`, `useGeofence`, `useAudioPlayback`, `useUserProfile`) e, se lo stato condiviso cresce, uno store leggero (es. Zustand).

### 3.2 Nessun test e nessun controllo automatico
Non c’è nessun test e nessuna GitHub Action.
**Cosa fare:**
- Vitest per la logica pura (`getDistanceMeters`, fallback delle narrazioni, costruzione della cronologia in `/ask`);
- Supertest per gli endpoint di `server.ts`;
- Playwright per il flusso “avvia tour → arrivo alla tappa → narrazione”;
- una GitHub Action che esegue `npm run lint` (già presente: `tsc --noEmit`) e i test su ogni pull request.

### 3.3 Nome del progetto non uniforme
Convivono “Cicerone AI” (`metadata.json`, log del server, chiavi `localStorage`, codici `CIC-`), “Almagora” (`index.html`, prompt di `/ask`) e “react-example” (`package.json`).
**Cosa fare:** scegliere Almagora ovunque. Attenzione: cambiando la chiave `cicerone_user_profile` in `localStorage` va prevista una migrazione, o gli utenti perdono il profilo salvato.

### 3.4 Manca il README
Chi apre il repo non sa come avviare l’app, quali chiavi servono (Gemini, Google Maps) né come usare LM Studio.
**Cosa fare:** README con descrizione, `npm install` / `npm run dev`, tabella delle variabili `.env`, schema dell’architettura.

### 3.5 Dati duplicati
Le tappe di Padova, Verona e Bologna sono scritte a mano in `server.ts` (fallback di `/generate-tour`) e i tour curati in `src/data/mockTours.ts`; il fallback della narrazione esiste sia nel server sia in `ciceroneApi.ts`.
**Cosa fare:** una sola fonte dei dati (file JSON condivisi o database), importata da client e server.

### 3.6 Pulizia del repository
- La cartella `.gmp_cache/` contiene documentazione di Google Maps in cache: va tolta e aggiunta a `.gitignore`.
- Il server, avviato con `tsx`, compila TypeScript a ogni avvio anche in produzione: meglio compilarlo una volta (`esbuild` è già tra le dipendenze).
- Il client legge `error.message` in diversi punti con `any`: tipizzare gli errori.

---

## 4. Roadmap proposta

| Fase | Obiettivo | Attività |
|---|---|---|
| **1 · Subito** | Mettere in sicurezza | Protezione della sincronizzazione, database, rate limit, validazione input, README, nome unico |
| **2 · Prossimi passi** | Rendere reale | GPS del telefono, PWA offline, test + GitHub Actions, divisione di `App.tsx` |
| **3 · Crescita** | Allargare | Pagamenti Pro, registrazioni per tutte le tappe, inglese e altre lingue, nuove città |

---

## Già risolto

- **Immagini coerenti con i luoghi** e **clip audio del Colosseo collegate**: sistemati nella PR #2 (foto in `public/images/places`, crediti in `public/images/places/CREDITS.md`).
