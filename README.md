# Research Compatibility Explorer — Google Scholar + AI

Il progetto usa snapshot CSV esportati da Google Scholar per ottenere **titolo, autori e anno** delle pubblicazioni di ricercatori scelti da un catalogo chiuso. Un backend OpenAI cerca poi online le fonti corrispondenti e analizza soltanto il materiale effettivamente accessibile.

## Principio di funzionamento

```text
Google Scholar CSV
  → autore, titolo, anno
  → ricerca web AI
  → identificazione del paper
  → full text / abstract / metadati
  → dati strutturati di compatibilità
```

L'AI non deve dedurre il contenuto dal solo titolo. Per ogni lavoro restituisce uno dei livelli:

- `full_text`: testo completo legittimamente accessibile;
- `abstract`: è stato reperito almeno l'abstract;
- `metadata_only`: sono stati verificati soltanto i metadati;
- `not_found`: il lavoro non è stato identificato con sufficiente sicurezza.

## Output AI

La dashboard mostra esclusivamente dati strutturati:

- keyword del paper;
- metodi;
- oggetti di studio;
- risultati verificabili;
- fonti consultate;
- incertezze;
- keyword trasversali;
- segnali di compatibilità fra le tematiche scelte;
- punteggi di evidenza, novità e distanza metodologica;
- domande aperte, non progetti già confezionati.

## Struttura

```text
research-compatibility-ai/
├── index.html
├── styles.css
├── app.js
├── config.js
├── researchers.js
├── data/scholar/*.csv
├── api/analyze.js
├── package.json
└── vercel.json
```

## Configurazione

### 1. Frontend GitHub Pages

Pubblicare i file statici su GitHub Pages.

Se il backend è ospitato in un progetto Vercel separato, modificare `config.js`:

```javascript
window.APP_CONFIG = {
  AI_API_BASE: "https://nome-backend.vercel.app"
};
```

Se frontend e backend vengono pubblicati insieme su Vercel, lasciare la stringa vuota.

### 2. Backend Vercel

Configurare queste variabili d'ambiente:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
ALLOWED_ORIGIN=https://TUO-USERNAME.github.io
```

La chiave OpenAI deve restare sul server e non deve mai essere inserita in `config.js`, `app.js` o nel repository pubblico.

### 3. Google Scholar

Per ogni ricercatore:

1. aprire il profilo Google Scholar;
2. esportare le pubblicazioni in CSV;
3. salvare il file in `data/scholar/`;
4. aggiornare `researchers.js`.

I campi minimi sono:

```csv
Title,Authors,Year
```

## Limiti reali

Autore, titolo e anno sono sufficienti per cercare e identificare molti paper, ma non garantiscono l'accesso al testo completo. Il risultato dipende dalla disponibilità di:

- pagine dell'editore;
- abstract indicizzati;
- DOI;
- preprint;
- repository istituzionali;
- versioni open access.

Un paper dietro paywall può essere identificato correttamente senza poter essere letto integralmente. La dashboard espone esplicitamente questo limite.

## Costi

Google Scholar e GitHub Pages restano gratuiti. L'uso dell'API OpenAI non è incluso automaticamente nell'abbonamento ChatGPT e comporta costi API in base al modello, ai token e alle chiamate di ricerca web utilizzate.
