#!/usr/bin/env python3
"""Create/update Google Scholar CSV snapshots for catalog researchers.

Uses the unofficial `scholarly` package. Google Scholar may block automated
traffic; failures are reported explicitly and existing CSV files are preserved.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import sys
import time
from pathlib import Path
from typing import Any

from scholarly import scholarly

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "researchers.json"
FIELDS = ["Title", "Authors", "Year", "Publication", "Citations", "ScholarURL"]


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(str(x).strip() for x in value if str(x).strip())
    return str(value).strip()


def publication_row(pub: dict[str, Any], details: dict[str, Any]) -> dict[str, str]:
    bib = details.get("bib") or pub.get("bib") or {}
    return {
        "Title": clean(bib.get("title")),
        "Authors": clean(bib.get("author") or bib.get("authors")),
        "Year": clean(bib.get("pub_year") or bib.get("year")),
        "Publication": clean(
            bib.get("citation")
            or bib.get("journal")
            or bib.get("venue")
            or bib.get("publisher")
        ),
        "Citations": clean(details.get("num_citations") or pub.get("num_citations")),
        "ScholarURL": clean(details.get("pub_url") or details.get("eprint_url") or pub.get("pub_url")),
    }


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def update_researcher(researcher: dict[str, Any], delay: float, max_pubs: int) -> int:
    rid = clean(researcher.get("id"))
    author_id = clean(researcher.get("scholarAuthorId"))
    if not author_id:
        print(f"SKIP {rid}: scholarAuthorId missing")
        return 0

    print(f"Fetching {researcher.get('name', rid)} ({author_id})")
    author = scholarly.search_author_id(author_id, filled=False)
    author = scholarly.fill(author, sections=["basics", "publications"])
    publications = list(author.get("publications") or [])
    if max_pubs > 0:
        publications = publications[:max_pubs]

    rows: list[dict[str, str]] = []
    for index, pub in enumerate(publications, start=1):
        try:
            details = scholarly.fill(pub)
            row = publication_row(pub, details)
            if row["Title"]:
                rows.append(row)
            print(f"  {index}/{len(publications)} {row['Title'][:80]}")
        except Exception as exc:  # preserve partial progress in memory
            bib = pub.get("bib") or {}
            fallback = publication_row(pub, {"bib": bib})
            if fallback["Title"]:
                rows.append(fallback)
            print(f"  WARN publication {index}: {exc}", file=sys.stderr)
        time.sleep(delay + random.uniform(0.2, 0.8))

    if not rows:
        raise RuntimeError(f"No publications retrieved for {rid}; existing CSV not overwritten")

    relative = clean(researcher.get("publicationsFile")).removeprefix("./")
    output = ROOT / relative
    rows.sort(key=lambda x: (x["Year"], x["Title"]), reverse=True)
    write_csv(output, rows)
    print(f"WROTE {output.relative_to(ROOT)} ({len(rows)} publications)")
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--researcher", help="Catalog id; omit to update all configured researchers")
    parser.add_argument("--delay", type=float, default=2.5, help="Base delay between publication requests")
    parser.add_argument("--max-publications", type=int, default=0, help="0 means all publications")
    args = parser.parse_args()

    researchers = json.loads(CATALOG.read_text(encoding="utf-8"))
    selected = [r for r in researchers if not args.researcher or r.get("id") == args.researcher]
    if args.researcher and not selected:
        print(f"Unknown researcher id: {args.researcher}", file=sys.stderr)
        return 2

    failures = 0
    for researcher in selected:
        try:
            update_researcher(researcher, args.delay, args.max_publications)
        except Exception as exc:
            failures += 1
            print(f"ERROR {researcher.get('id')}: {exc}", file=sys.stderr)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
