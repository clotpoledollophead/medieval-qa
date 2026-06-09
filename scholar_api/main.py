"""
scholar_api/main.py — Pearl-Poet Google Scholar microservice
Uses `scholarly` inside a ThreadPoolExecutor so FastAPI can
serve multiple concurrent prefetch requests in parallel.

Deploy to Render (render.yaml included).
Endpoint: GET /scholar?q=QUERY&n=20
"""

import asyncio
import re
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from scholarly import scholarly

# Allow up to 4 concurrent scholarly fetches
executor = ThreadPoolExecutor(max_workers=4)

app = FastAPI(title="Pearl-Poet Scholar API", version="1.1.0")

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
async def search_scholar(
    q: str = Query(..., description="Search query"),
    n: int = Query(10, ge=1, le=20, description="Max results"),
):
    """
    Fetch up to `n` papers from Google Scholar for query `q`.
    Runs the blocking scholarly call in a thread so FastAPI stays
    responsive to other concurrent requests.
    """
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(executor, lambda: _fetch(q, n))
    return results


def _fetch(query: str, n: int) -> list | dict:
    """Blocking scholarly fetch — runs in thread pool."""
    results = []
    try:
        search_iter = scholarly.search_pubs(query)
        for _ in range(n):
            try:
                paper = next(search_iter)
            except StopIteration:
                break

            bib      = paper.get("bib", {})
            year_raw = str(bib.get("pub_year", "") or "")
            year     = int(year_raw) if re.match(r"^\d{4}$", year_raw) else 0

            url = paper.get("pub_url") or paper.get("eprint_url") or ""

            authors_raw = bib.get("author", [])
            if isinstance(authors_raw, list):
                authors = ", ".join(authors_raw[:3])
                if len(authors_raw) > 3:
                    authors += " et al."
            else:
                authors = str(authors_raw)

            abstract = str(bib.get("abstract", "") or "")
            if len(abstract) > 400:
                abstract = abstract[:400] + "…"

            results.append({
                "title":    bib.get("title", "Untitled"),
                "authors":  authors,
                "year":     year,
                "journal":  bib.get("venue", ""),
                "abstract": abstract,
                "url":      url,
                "cited_by": paper.get("num_citations", 0),
                "source":   "Google Scholar",
            })

            time.sleep(0.4)  # polite delay between Scholar requests

    except Exception as exc:
        # Return partial results rather than a hard 500
        return {"error": str(exc), "papers": results}

    results.sort(key=lambda p: p["year"] or 0, reverse=True)
    return results