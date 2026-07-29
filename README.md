# Research Compatibility Explorer

Dashboard GitHub Pages per esplorare possibili compatibilità tra due ricercatori, ciascuno associato a circa cinque paper PDF.

Il progetto **non genera proposte di ricerca già confezionate**. Il flusso obbliga l'utente a compiere una scelta scientifica:

1. selezione di due ricercatori;
2. generazione delle tematiche tipiche di ciascun autore a partire da profilo, keyword e paper;
3. scelta di 1–3 tematiche per ogni autore;
4. calcolo degli indicatori soltanto sulle tematiche selezionate.

## Output

La dashboard mostra esclusivamente dati esplorativi:

- vocaboli comuni e parole-ponte;
- word cloud;
- compatibilità tra coppie di tematiche;
- novità, fattibilità e forza delle evidenze;
- stadio di sviluppo scientifico;
- trend dell'intersezione;
- domanda aperta da approfondire;
- paper dei due autori che sostengono la connessione.

I punteggi servono a orientare una successiva valutazione umana. Non rappresentano una proposta progettuale, una raccomandazione o una valutazione conclusiva.

## Modalità GitHub Pages

La modalità predefinita è interamente statica e non richiede API o server. Le tematiche vengono ricavate in modo deterministico da `data/researchers.json`; gli indicatori dipendono dalle selezioni effettuate dall'utente.

### Pubblicazione

1. Crea un repository GitHub.
2. Carica nella root tutto il contenuto della cartella.
3. Apri **Settings → Pages**.
4. Scegli **Deploy from a branch**.
5. Seleziona `main` e `/ (root)`.

## Modalità AI strutturata opzionale

Il file `api/analyze.js` implementa un endpoint Vercel opzionale. Anche in questa modalità l'AI:

- riceve le tematiche già scelte dall'utente;
- restituisce esclusivamente JSON validato;
- non produce discorsi o progetti completi;
- associa ogni connessione a paper e domanda aperta.

Variabili Vercel:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

GitHub Pages non può custodire una chiave API. Perciò la modalità AI richiede Vercel o un backend equivalente.

## Aggiungere o sostituire i ricercatori

Modifica `data/researchers.json`. Ogni ricercatore contiene:

- nome, ruolo e istituzione;
- keyword generali;
- circa cinque paper;
- titolo, anno, abstract, keyword e nome del PDF.

Esempio:

```json
{
  "title": "Titolo del paper",
  "year": 2026,
  "file": "paper-01.pdf",
  "keywords": ["tema A", "metodo B"],
  "abstract": "Abstract sintetico."
}
```

Il PDF va inserito nella relativa cartella sotto `papers/` con lo stesso nome indicato nel campo `file`.

## Struttura

```text
research-synergy-dashboard/
├── api/analyze.js
├── data/researchers.json
├── papers/
├── scripts/
├── app.js
├── index.html
├── styles.css
├── vercel.json
└── README.md
```

## Avvio locale

```bash
npm run dev
```

Apri `http://localhost:3000`.

## Build

```bash
npm run build
npm run preview
```

## Privacy

I PDF presenti in un repository pubblico diventano pubblici. Per documenti riservati, non pubblicare la cartella `papers/` tramite GitHub Pages e utilizza storage e backend autenticati.

## Licenza

MIT.
