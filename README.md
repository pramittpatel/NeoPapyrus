# ⚖️ PaperCourt

**Plenty of tools summarize papers. PaperCourt makes papers argue with each other, then shows you the research gaps nobody has filled yet.**

Built for the **Best Use of Snowflake** prize. Everything (storage, PDF parsing, embeddings, vector search, LLMs, the web app and usage analytics) runs inside one Snowflake account.

## What it does

| Tab | What you get |
|---|---|
| 🔎 Ask | A cited answer from your papers, a 🟢 Must Read / 🟡 Related / 🔴 Skip badge for each paper, and an explanation level slider (High-schooler / Undergrad / PhD) |
| 📚 Library | An AI-extracted card per paper: summary, method, key finding, limitations |
| ⚔️ Debate | Pick two papers and a question. Each side argues using only its own paper's text, then an AI judge rules |
| 🧭 Research Gaps | Where the papers agree, where they disagree, and 3 open research questions |
| 📈 Insights | Every question is logged to a table: most-cited papers, recent questions, AI-grouped themes |
| 💻 CLI | `papercourt_cli.py` asks your papers a question from a terminal through the Cortex REST API |

## Snowflake features used

| Feature | Use |
|---|---|
| Internal stage + directory table | Store and list the PDFs |
| `AI_PARSE_DOCUMENT` | PDF to text, keeping the layout |
| `SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER` | Split papers into overlapping chunks |
| `AI_EMBED` + `VECTOR` type | Embeddings for each chunk |
| Cortex Search Service | Managed hybrid keyword + vector retrieval for RAG |
| `AI_COMPLETE` (Llama 3.3 70B, open-weight) | Answers, verdicts, debates, gaps, cards, themes |
| `VARIANT`, `ARRAY`, `TRY_PARSE_JSON`, `FLATTEN` | Library cards and the question log |
| Streamlit in Snowflake | The web app, hosted inside the account |
| Snowpark Python | App-to-data access |
| Cortex REST API + Python connector | The laptop command-line client |

## Architecture

```
PDFs -> Stage -> PARSE_DOCUMENT -> papers_raw -> SPLIT_TEXT -> chunks (+ EMBED_TEXT_768 vectors)
                                          \-> COMPLETE -> paper_cards
User -> Streamlit in Snowflake -> vector search on chunks -> COMPLETE with cited excerpts -> answer
                               \-> question_log -> Insights tab
Laptop -> papercourt_cli.py -> vector search (connector) + Cortex REST API -> answer
```

## Setup

0. Copy `.env.example` to `.env` and fill in credentials. Install with `pip install -r requirements.txt`.
1. `python upload_papers.py` (PDFs from `papers/`), then `python run_sql.py setup.sql` (or run `setup.sql` block by block in Snowsight). New accounts block legacy `SNOWFLAKE.CORTEX.*` functions, so this uses the AI_* functions.
   Local test: `streamlit run streamlit_app.py`.
2. Create a Streamlit app (Projects -> Streamlit -> + Streamlit App) in `PAPERCOURT.PUBLIC`, paste `streamlit_app.py` and click Run.
3. Optional CLI: `pip install -r requirements.txt`, set `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` (and `SNOWFLAKE_PAT` for the REST API), then run `python papercourt_cli.py "your question"`.

> Never commit passwords or tokens. Keep them in environment variables.

## Web app (Next.js)

`web/` is the main site, built from the design prototypes. Server-side route handlers (`web/app/api/*`) talk to Snowflake through the Node SDK, so credentials never reach the browser.

```
cd web && npm install
cp ../.env .env.local        # SNOWFLAKE_ACCOUNT / USER / PASSWORD / ROLE / WAREHOUSE, optional CORTEX_MODEL
npm run dev -- -p 3000       # http://localhost:3000
```

| Screen | What it does |
|---|---|
| Home | Ask a question; scope it to a collection (team papers, arXiv papers or a topic); Deep search runs more queries |
| Answer | Cited answer; clicking a `[n]` chip jumps to that source; evidence matrix and topic map panel; APA / MLA / BibTeX; copy as formatted text; download citations |
| Source | Why the paper was chosen (sub-question, query, passage, where the answer uses it) next to the real PDF, opened to the cited page |
| Library | Every indexed paper with a typeable filter, collection filter and saved papers |
| Debate / Gaps | Two papers argue one question; agree / disagree / open-gaps summary |

How an answer is built: the question is split into sub-questions, each is searched with the Cortex Search Service, results are merged by paper, the model writes a cited answer from those passages, and each cited paper gets a short stance and summary. Citations are generated from paper metadata, not by the model. The PDF page is found by matching the passage against per-page text stored in `paper_pages`.

## Adding papers

1. Put PDFs on the stage: `python upload_papers.py` (from `papers/`), or copy them from another stage with `COPY FILES INTO @PAPERCOURT.PUBLIC.papers FROM @<db>.<schema>.<stage>`.
2. `python ingest.py` indexes only what is new (pages, chunks, library cards, citation metadata, topics) and rebuilds the search service. `fetch_papers.py` downloads more arXiv papers politely and can be re-run.

## Why a web app

The project is built on Snowflake, and the work happens on laptops, so a Streamlit web app running inside Snowflake is the best fit. The REST API means a mobile app could use the same backend later.

## Team

- Pramit Patel
- Rohan Karve
- Carlos mata

## Model choice

Default is `llama3.3-70b` (open-weight, fastest, cheapest of the models tested; answers are shorter). Set in `MODELS` in `streamlit_app.py` and `PAPERCOURT_MODEL` for the CLI. Also working on our account: `claude-sonnet-5-5`, `claude-haiku-5-5`, `openai-gpt-5.2`. Legacy and blocked: `mistral-large2`, `mistral-large`. Per-model rates are not verified; check Snowflake's Service Consumption Table before switching.
