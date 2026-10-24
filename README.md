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

## Why a web app

The project is built on Snowflake, and the work happens on laptops, so a Streamlit web app running inside Snowflake is the best fit. The REST API means a mobile app could use the same backend later.

## Team

- Pramit Patel
- Rohan Karve
- Carlos mata

## Model choice

Default is `llama3.3-70b` (open-weight, fastest, cheapest of the models tested; answers are shorter). Set in `MODELS` in `streamlit_app.py` and `PAPERCOURT_MODEL` for the CLI. Also working on our account: `claude-sonnet-5-5`, `claude-haiku-5-5`, `openai-gpt-5.2`. Legacy and blocked: `mistral-large2`, `mistral-large`. Per-model rates are not verified; check Snowflake's Service Consumption Table before switching.
