"""
scholar_api/main.py — Pearl-Poet Google Scholar microservice
Uses the `scholarly` library for reliable Scholar access.

Deploy to Render (render.yaml included) or any Python host.
Free tier is sufficient for this use case.

Endpoint:
  GET /scholar?q=QUERY&n=10
  Returns JSON array of paper objects sorted newest-first,
  or { "error": "...", "papers": [] } on failure.
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from scholarly import scholarly
import time
import re

app = FastAPI(title="Pearl-Poet Scholar API", version="1.0.0")

# Allow any origin — this API is called directly from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "service": "Pearl-Poet Scholar API"}


@app.get("/scholar")
def search_scholar(
    q: str   = Query(..., description="Search query"),
    n: int   = Query(10, ge=1, le=20, description="Max results"),
    sort: str = Query("date", description="Sort order: date | relevance"),
):
    """
    Fetch up to `n` papers from Google Scholar for query `q`.
    Returns a JSON array sorted by year descending (newest first).
    """
    results = []

    try:
        search_iter = scholarly.search_pubs(q)

        for _ in range(n):
            try:
                paper = next(search_iter)
            except StopIteration:
                break

            bib      = paper.get("bib", {})
            year_raw = bib.get("pub_year", "") or ""
            year     = int(year_raw) if re.match(r"^\d{4}$", str(year_raw)) else 0

            # Prefer pub_url, fall back to eprint (PDF) URL
            url = (
                paper.get("pub_url")
                or paper.get("eprint_url")
                or ""
            )

            # scholarly returns authors as a list or a single string
            authors_raw = bib.get("author", [])
            if isinstance(authors_raw, list):
                authors = ", ".join(authors_raw[:3])
                if len(authors_raw) > 3:
                    authors += " et al."
            else:
                authors = str(authors_raw)

            abstract = bib.get("abstract", "") or ""
            if len(abstract) > 400:
                abstract = abstract[:400] + "…"

            results.append({
                "title":     bib.get("title", "Untitled"),
                "authors":   authors,
                "year":      year,
                "journal":   bib.get("venue", ""),
                "abstract":  abstract,
                "url":       url,
                "cited_by":  paper.get("num_citations", 0),
                "source":    "Google Scholar",
            })

            # Small polite delay between Scholar requests
            time.sleep(0.4)

    except Exception as exc:
        # Return whatever we collected so far rather than a hard 500
        return {"error": str(exc), "papers": results}

    # Sort newest first; papers with unknown year go last
    results.sort(key=lambda p: p["year"] or 0, reverse=True)
    return results