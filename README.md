# Research Compatibility Explorer — Google Scholar Sync Button

Questa versione include realmente la cartella `.github/workflows` e un pulsante amministrativo nel sito per creare o aggiornare i CSV Google Scholar.

## Punto tecnico essenziale

GitHub Pages è statico: non può eseguire Python e non può scrivere nel repository. Il pulsante chiama una funzione serverless (`api/sync-scholar.js`), che tramite la GitHub REST API avvia il workflow `.github/workflows/update-scholar.yml`. Il workflow esegue Python, crea il CSV, esegue commit e push.

## Struttura necessaria

```text
.github/workflows/update-scholar.yml
scripts/update_google_scholar.py
scripts/generate_researchers_js.py
api/sync-scholar.js
data/researchers.json
data/scholar/
```

> `.github` è una cartella nascosta su macOS/Linux. Verificala con `ls -la` oppure direttamente nell'interfaccia GitHub.

## Configurazione Vercel

Collega il repository a Vercel e configura:

```text
ADMIN_SYNC_KEY=una-password-lunga-e-casuale
GITHUB_TOKEN=token-fine-grained
GITHUB_OWNER=tuo-username
GITHUB_REPO=nome-repository
GITHUB_REF=main
GITHUB_WORKFLOW_FILE=update-scholar.yml
ALLOWED_ORIGIN=https://tuo-username.github.io
```

Il token GitHub deve avere accesso soltanto al repository interessato e il permesso **Actions: write**. Il workflow usa il proprio `GITHUB_TOKEN` con `contents: write` per eseguire il commit.

In `config.js`:

```js
window.APP_CONFIG = {
  AI_API_BASE: "https://tuo-backend.vercel.app",
  SYNC_API_BASE: "https://tuo-backend.vercel.app"
};
```

## Uso

1. Aggiungi il ricercatore in `data/researchers.json` usando un `id` senza accenti, per esempio `ivan-colage`.
2. Inserisci `scholarAuthorId`, per esempio `wH5FfH0AAAAJ`.
3. Esegui commit di `data/researchers.json`.
4. Nel sito scegli il ricercatore nel pannello **Aggiorna Google Scholar**.
5. Inserisci `ADMIN_SYNC_KEY` e premi **Crea / aggiorna CSV**.
6. Apri il collegamento ad Actions mostrato dal sito e attendi il completamento.
7. Il workflow crea `data/scholar/ivan-colage.csv`, lo committa e GitHub Pages viene ridistribuito.

La chiave GitHub non viene mai inviata al browser. Nel browser viene inserita soltanto la chiave amministrativa, verificata dal backend.

## Limite Google Scholar

La sincronizzazione usa `scholarly`, non un'API ufficiale. Google Scholar può mostrare CAPTCHA o bloccare gli IP dei runner GitHub. In tal caso esegui localmente:

```bash
pip install -r requirements-scholar.txt
python scripts/update_google_scholar.py --researcher ivan-colage
git add data/scholar/ivan-colage.csv
git commit -m "Update Ivan Colage Scholar snapshot"
git push
```
