# NeoPapyrus

**Plenty of tools summarize papers. NeoPapyrus makes them debate, then shows you the research gaps nobody has filled yet.**

A research paper discovery assistant for AI in medicine. Ask a question and get an answer that cites the exact passages it came from, see which papers are worth reading, make two papers argue a question, and find the open research questions between them. The papers, parsing, embeddings, search and language model all live in one Snowflake account.

Built for the **Best Use of Snowflake** prize by Pramit Patel, Rohan Karve, Carlos Mata and Chance Caswell. Pitch deck: [`docs/NeoPapyrus.pdf`](docs/NeoPapyrus.pdf).

## What it does

| Feature | What you get |
|---|---|
| **Ask** | A cited answer at a High school, Undergrad or PhD level. Every `[n]` jumps to its source. Each cited paper gets an evidence stance, an evidence matrix and a topic map. |
| **Why this paper** | For each source: the sub-question it answered, the search that found it, the passage it relied on, and where the answer uses it, next to the real PDF opened to that page. |
| **Paper debate** (flagship) | Pick a paper, or let NeoPapyrus pick the best match. It then finds the paper whose evidence most challenges it. Each side argues only from its own text. The judge rules on where they agree and disagree, weighs publication recency, lists the **research gaps** neither paper fills, and proposes **research topics** to fill them. |
| **Research gaps** | For any topic: where the papers agree, where they disagree, and what is still open. |
| **Citations** | APA 7, MLA 9 and BibTeX built from paper metadata, not written by the model. Copy as a formatted reference list (hanging indent, alphabetical, italics), copy the answer with in-text citations, or download RTF / `.bib`. |
| **Library** | Your recent papers and favorites. Collections scope any search to team papers, arXiv papers or a topic. |

## Corpus

128 papers, 8,659 searchable passages:

- **17 team papers**: peer-reviewed clinical AI papers (BMJ Open, JMIR, Journal of Medical Systems, Communications Medicine and others), staged in `RESEARCH_DB` and copied into the app's stage. This is the default collection.
- **111 arXiv papers** on medical AI, fetched with `fetch_papers.py`.

PDFs are not committed (`papers/` is git-ignored).

## Architecture

```
PDFs ─► internal stage ─► AI_PARSE_DOCUMENT (per page) ─► paper_pages ─► papers_raw
                                                                 │
          SPLIT_TEXT_RECURSIVE_CHARACTER + AI_EMBED ◄─────────────┘
                         │
                         ▼
          chunks ─► Cortex Search Service (hybrid keyword + vector)
          AI_COMPLETE ─► paper_cards (summaries), paper_meta (title, authors, year, venue, topic)

Browser ─► Next.js route handlers (Snowflake Node SDK, credentials stay server-side)
             ├─ /api/ask      split question ─► search each part ─► AI_COMPLETE cited answer ─► per-paper stance
             ├─ /api/debate   best match ─► strongest counterpoint ─► arguments ─► judge: agree / disagree / recency / gaps / topics
             ├─ /api/gaps, /api/library, /api/collections, /api/papers/search
             └─ /api/pdf      GET_PRESIGNED_URL ─► streams the staged PDF
```

Ask and Debate stream real progress steps to the browser while they run. `streamlit_app.py` is a Streamlit-in-Snowflake version of the core features.

### Snowflake features used

| Feature | Used for |
|---|---|
| Internal stage + directory table, `COPY FILES` | Storing the PDFs; copying the team papers in from `RESEARCH_DB` |
| `AI_PARSE_DOCUMENT` (layout, page split) | PDF to text, kept per page so citations open the PDF on the right page |
| `SPLIT_TEXT_RECURSIVE_CHARACTER` | Overlapping passages |
| `AI_EMBED` + `VECTOR` | Passage embeddings (`snowflake-arctic-embed-m-v1.5`) |
| Cortex Search Service | Hybrid retrieval for answers, debates, gaps and the paper picker |
| `AI_COMPLETE` (Llama 3.3 70B, open weights) | Sub-questions, answers, stances, debate arguments, rulings, cards, metadata, topics |
| `VARIANT`, `ARRAY`, `FLATTEN`, `OBJECT_INSERT` | Paper cards, metadata and the question log |
| `GET_PRESIGNED_URL` | Serving staged PDFs to the in-app viewer |
| Streamlit in Snowflake + Snowpark | `streamlit_app.py` |

New accounts can't use the legacy `SNOWFLAKE.CORTEX.COMPLETE` / `EMBED_TEXT_768` / `PARSE_DOCUMENT` functions, so everything uses the `AI_*` functions.

## Repository layout

| Path | What it is |
|---|---|
| `web/` | The Next.js app (App Router, React 19, TypeScript) |
| `setup.sql` | One-time Snowflake setup: database, stage, base tables, search service |
| `ingest.py` | Incremental indexing of everything on the stage (pages, passages, cards, metadata, topics, search service) |
| `fetch_papers.py`, `upload_papers.py` | Download arXiv PDFs into `papers/` and upload them to the stage |
| `run_sql.py` | Run a `.sql` file statement by statement |
| `streamlit_app.py` | Streamlit-in-Snowflake app |
| `neopapyrus_cli.py` | Ask from a terminal through the Cortex REST API (needs a PAT and a network policy) |
| `docs/` | Pitch deck and the design prototypes the UI was built from |

## Running it

Requirements: a Snowflake account with Cortex AI functions, Python 3.12, Node 20+.

```bash
cp .env.example .env                 # fill in your Snowflake credentials
python -m venv .venv && .venv/bin/pip install -r requirements.txt

.venv/bin/python run_sql.py setup.sql          # database, stage, tables, search service
.venv/bin/python fetch_papers.py               # optional: download arXiv papers into papers/
.venv/bin/python upload_papers.py              # upload papers/*.pdf to the stage
.venv/bin/python ingest.py                     # index everything new (--only team|arxiv|all)

cd web && npm install
cp ../.env .env.local
npm run dev                                    # http://localhost:3000
```

The default model is `llama3.3-70b`. Set `CORTEX_MODEL` to change it.

## Demo script

1. **Paper debate**: leave both sides on Auto and ask *"Should hospitals adopt LLMs like DeepSeek now, or wait for more evidence?"* A review of systematic reviews ("not yet ready for autonomous deployment") faces the DeepSeek paper (deployed in 90 hospitals, "a 40-fold increase in efficiency"), which was chosen automatically. Point out the recency badges, the ruling, the research gaps and the proposed studies.
2. **Ask**: *"Can large language models be used for clinical prediction?"* Click a `[n]` chip, then "Why this?" to show the passage next to the PDF.
3. **Copy references** in APA and paste into Google Docs to show the formatted reference list.

Backup debate questions: *"Is hallucination a deal-breaker for using LLMs in medicine?"* and *"Can AI reliably detect lung and pulmonary nodules?"*

## Notes

- **Research aid only. Not medical advice.**
- Credentials live in `.env` / `web/.env.local`, which are git-ignored. The web app has no login or rate limiting, so don't expose it publicly beyond a demo.
- Summaries, stances and metadata are model-generated. Check the paper before relying on them.
