# Research Compatibility Explorer — Google Scholar snapshots + AI

Il catalogo dei ricercatori è mantenuto in `data/researchers.json`. Per ogni ricercatore, uno script recupera il profilo Google Scholar tramite il suo **Google Scholar Author ID**, crea il CSV con titoli, autori e anni e lo salva in `data/scholar/`. La dashboard GitHub Pages legge questi snapshot; il modulo AI usa poi i metadati per cercare e analizzare le fonti accessibili.

## Punto essenziale

GitHub Pages è statico e **non può creare o modificare file nel repository**. La generazione dei CSV avviene quindi in uno di questi due modi:

1. **localmente**, eseguendo lo script Python;
2. tramite la **GitHub Action** inclusa, che aggiorna e committa i CSV.

L'accesso automatizzato a Google Scholar non è ufficialmente supportato. Lo script usa la libreria non ufficiale `scholarly`; Google può mostrare CAPTCHA o bloccare temporaneamente l'IP. In caso di errore, il CSV esistente non viene sovrascritto.

## 1. Aggiungere un ricercatore

Apri `data/researchers.json` e aggiungi:

```json
{
  "id": "nome-cognome",
  "name": "Nome Cognome",
  "affiliation": "Università",
  "description": "Aree scientifiche principali",
  "scholarAuthorId": "ABC123xyzAAAAJ",
  "googleScholarUrl": "https://scholar.google.com/citations?user=ABC123xyzAAAAJ",
  "publicationsFile": "./data/scholar/nome-cognome.csv"
}
```

L'Author ID è il valore dopo `user=` nell'URL del profilo Scholar.

## 2. Creare il CSV localmente

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-scholar.txt
python scripts/generate_researchers_js.py
python scripts/update_google_scholar.py --researcher nome-cognome
```

Per aggiornare tutti i ricercatori configurati:

```bash
python scripts/update_google_scholar.py
```

Il CSV generato contiene:

```csv
Title,Authors,Year,Publication,Citations,ScholarURL
```

## 3. Aggiornamento da GitHub

La workflow è in `.github/workflows/update-scholar.yml` e parte:

- quando cambia `data/researchers.json`;
- manualmente da **Actions → Update Google Scholar snapshots → Run workflow**;
- il primo giorno di ogni mese.

Per aggiornare una sola persona, inserisci il relativo `researcher_id`. La Action genera `researchers.js`, aggiorna i CSV e committa le modifiche.

### Permessi del repository

In GitHub apri:

```text
Settings → Actions → General → Workflow permissions
```

seleziona:

```text
Read and write permissions
```

altrimenti la Action non può effettuare il commit.

## 4. Se Google blocca la GitHub Action

Gli IP condivisi dei runner GitHub possono essere sottoposti a CAPTCHA. In questo caso esegui lo script localmente e fai commit del CSV:

```bash
git add data/researchers.json researchers.js data/scholar/nome-cognome.csv
git commit -m "Update Scholar profile"
git push
```

Questa modalità usa il tuo normale accesso di rete ed è spesso più affidabile, ma non elimina la possibilità di blocchi Scholar.

## 5. Modulo AI

La dashboard invia al backend OpenAI principalmente:

- titolo;
- autori;
- anno;
- URL Scholar disponibile;
- temi selezionati.

L'AI deve distinguere fra testo completo, abstract, soli metadati e paper non identificato. Non deve sostenere di aver letto un articolo quando ha reperito soltanto il titolo.

## Struttura

```text
research-compatibility-ai-scholar-sync/
├── .github/workflows/update-scholar.yml
├── api/analyze.js
├── data/
│   ├── researchers.json
│   └── scholar/*.csv
├── scripts/
│   ├── generate_researchers_js.py
│   └── update_google_scholar.py
├── researchers.js
├── requirements-scholar.txt
├── index.html
├── app.js
└── styles.css
```
