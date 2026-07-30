#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any

from scholarly import scholarly

ROOT_DIR = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT_DIR / "data" / "researchers.json"
CSV_FIELDS = ["Title", "Authors", "Year", "Publication", "Citations", "ScholarURL"]


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKC", text)
    return " ".join(text.split())


def normalize_title(value: Any) -> str:
    return normalize_text(value)


def clean_path(value: str) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("publicationsFile mancante")
    while raw.startswith("./"):
        raw = raw[2:]
    path = Path(raw)
    return path if path.is_absolute() else ROOT_DIR / path


def load_catalog() -> list[dict[str, Any]]:
    if not CATALOG_PATH.exists():
        raise FileNotFoundError(f"Catalogo non trovato: {CATALOG_PATH}")
    with CATALOG_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError("data/researchers.json deve contenere una lista JSON.")
    return data


def load_existing_titles(csv_path: Path) -> set[str]:
    if not csv_path.exists():
        return set()
    titles: set[str] = set()
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            title = normalize_title(row.get("Title", ""))
            if title:
                titles.add(title)
    return titles


def ensure_csv_header(csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    if csv_path.exists() and csv_path.stat().st_size > 0:
        return
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        csv.DictWriter(handle, fieldnames=CSV_FIELDS).writeheader()


def append_row(csv_path: Path, row: dict[str, Any]) -> None:
    ensure_csv_header(csv_path)
    with csv_path.open("a", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writerow(row)
        handle.flush()


def first_nonempty(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = ", ".join(str(x) for x in value if x) if isinstance(value, list) else str(value)
        text = text.strip()
        if text:
            return text
    return ""


def publication_to_row(publication: dict[str, Any]) -> dict[str, Any] | None:
    bib = publication.get("bib", {})
    if not isinstance(bib, dict):
        bib = {}
    title = first_nonempty(bib.get("title"), publication.get("title"))
    if not title:
        return None
    return {
        "Title": title,
        "Authors": first_nonempty(bib.get("author"), bib.get("authors"), publication.get("author"), publication.get("authors")),
        "Year": first_nonempty(bib.get("pub_year"), bib.get("year"), publication.get("pub_year"), publication.get("year")),
        "Publication": first_nonempty(bib.get("citation"), bib.get("venue"), bib.get("journal"), bib.get("conference"), publication.get("venue")),
        "Citations": publication.get("num_citations", "") if publication.get("num_citations") is not None else "",
        "ScholarURL": first_nonempty(publication.get("pub_url"), publication.get("eprint_url"), publication.get("citedby_url")),
    }


def fetch_author_publications(scholar_author_id: str, max_publications: int) -> list[dict[str, Any]]:
    print(f"Caricamento profilo Scholar: {scholar_author_id}", flush=True)
    author = scholarly.search_author_id(
        scholar_author_id,
        filled=True,
        publication_limit=max_publications,
    )
    publications = author.get("publications", [])
    if not isinstance(publications, list):
        publications = list(publications or [])
    return publications[:max_publications] if max_publications > 0 else publications


def export_author_publications(*, researcher_id: str, scholar_author_id: str, csv_path: Path, max_publications: int, delay_seconds: float) -> tuple[int, int, int]:
    publications = fetch_author_publications(scholar_author_id, max_publications)
    existing_titles = load_existing_titles(csv_path)
    print(f"[{researcher_id}] Pubblicazioni trovate: {len(publications)}; già presenti: {len(existing_titles)}", flush=True)
    saved = skipped = 0
    for index, publication in enumerate(publications, start=1):
        row = publication_to_row(publication)
        if row is None:
            print(f"[{researcher_id}] [{index}/{len(publications)}] Titolo mancante: salto.", flush=True)
            continue
        title = row["Title"]
        normalized = normalize_title(title)
        if normalized in existing_titles:
            skipped += 1
            print(f"[{researcher_id}] [{index}/{len(publications)}] Già presente: {title}", flush=True)
            continue
        append_row(csv_path, row)
        existing_titles.add(normalized)
        saved += 1
        print(f"[{researcher_id}] [{index}/{len(publications)}] Salvato: {title}", flush=True)
        if delay_seconds > 0:
            time.sleep(delay_seconds)
    print(f"[{researcher_id}] CSV aggiornato: {csv_path}", flush=True)
    return len(publications), saved, skipped


def select_researchers(catalog: list[dict[str, Any]], requested_id: str) -> list[dict[str, Any]]:
    if not requested_id:
        return catalog
    exact = [x for x in catalog if str(x.get("id", "")) == requested_id]
    if exact:
        return exact
    normalized_requested = normalize_text(requested_id)
    normalized = [x for x in catalog if normalize_text(x.get("id", "")) == normalized_requested]
    if len(normalized) == 1:
        print(f"Avviso: uso l'ID del catalogo {normalized[0].get('id')!r} per la richiesta {requested_id!r}.", flush=True)
        return normalized
    available = ", ".join(str(x.get("id", "")) for x in catalog if x.get("id"))
    raise LookupError(f"Unknown researcher id: {requested_id}. ID disponibili: {available}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crea o aggiorna i CSV Google Scholar.")
    parser.add_argument("--researcher", default="", help="ID del ricercatore; se omesso, aggiorna tutti.")
    parser.add_argument("--max-publications", type=int, default=0, help="Numero massimo; 0 significa tutte.")
    parser.add_argument("--delay", type=float, default=0.0, help="Pausa dopo ogni nuova riga salvata.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.max_publications < 0 or args.delay < 0:
        print("Errore: max-publications e delay non possono essere negativi.", file=sys.stderr)
        return 1
    try:
        researchers = select_researchers(load_catalog(), args.researcher)
    except LookupError as exc:
        print(str(exc), file=sys.stderr, flush=True)
        return 2
    except Exception as exc:
        print(f"Errore di configurazione: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        return 1

    failures = completed = 0
    for researcher in researchers:
        researcher_id = str(researcher.get("id", "")).strip()
        scholar_author_id = str(researcher.get("scholarAuthorId", "")).strip()
        publications_file = str(researcher.get("publicationsFile", "")).strip()
        if not researcher_id or not scholar_author_id or not publications_file:
            print(f"SKIP {researcher_id or '<senza id>'}: configurazione incompleta.", file=sys.stderr, flush=True)
            failures += 1
            continue
        try:
            total, saved, skipped = export_author_publications(
                researcher_id=researcher_id,
                scholar_author_id=scholar_author_id,
                csv_path=clean_path(publications_file),
                max_publications=args.max_publications,
                delay_seconds=args.delay,
            )
            completed += 1
            print(f"[{researcher_id}] Riepilogo: trovate={total}, nuove={saved}, già_presenti={skipped}.", flush=True)
        except KeyboardInterrupt:
            print(f"\nInterrotto durante {researcher_id}. Le righe già scritte restano nel CSV.", file=sys.stderr, flush=True)
            return 130
        except Exception as exc:
            failures += 1
            print(f"ERRORE {researcher_id}: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            print("Il CSV precedente non è stato cancellato. Puoi rilanciare lo stesso comando.", file=sys.stderr, flush=True)

    print(f"Operazione conclusa: completati={completed}, errori={failures}.", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
