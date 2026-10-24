"""Incrementally index PDFs already uploaded to @papers: pages -> papers_raw -> chunks -> cards/meta -> search service.

Only files missing from each table are processed, so re-running after `upload_papers.py` is cheap.
usage: python ingest.py [--only team|arxiv|all]   (creds from .env; default all)
"""
import os, sys, re, argparse, warnings
warnings.filterwarnings("ignore")
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()
ap = argparse.ArgumentParser()
ap.add_argument("--only", choices=["team", "arxiv", "all"], default="all",
                help="process only team (non-arXiv) or arxiv PDFs; the search index always covers all chunks")
ONLY = ap.parse_args().only
con = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
    password=os.environ["SNOWFLAKE_PASSWORD"], role=os.getenv("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"), database="PAPERCOURT", schema="PUBLIC")
cur = con.cursor()
run = lambda sql, *a: cur.execute(sql, a or None)
MODEL = os.getenv("PAPERCOURT_MODEL", "llama3.3-70b")

run("CREATE TABLE IF NOT EXISTS paper_pages (file STRING, page INT, text STRING)")
run("CREATE TABLE IF NOT EXISTS paper_cards (file STRING, card VARIANT)")
run("CREATE TABLE IF NOT EXISTS paper_meta (file STRING, meta VARIANT)")
run("CREATE TABLE IF NOT EXISTS chunks (file STRING, chunk_id NUMBER, chunk STRING, emb VECTOR(FLOAT, 768))")
run("ALTER STAGE papers REFRESH")

ARXIV_RE = re.compile(r"^(\d{4}\.\d{4,5}v\d+_|[a-z\-]+_\d{7}v\d+_)")
source_of = lambda f: "arxiv" if ARXIV_RE.match(f) else "team"
want = lambda f: ONLY == "all" or source_of(f) == ONLY

def missing(table):
    return [r[0] for r in run(
        f"SELECT relative_path FROM DIRECTORY(@papers) WHERE relative_path NOT IN (SELECT file FROM {table} WHERE file IS NOT NULL) ORDER BY 1").fetchall() if want(r[0])]

def todo(table, col):
    """papers_raw files (in the chosen subset) with no usable row in `table` (absent, or NULL result -> row dropped and retried)."""
    run(f"DELETE FROM {table} WHERE {col} IS NULL")
    return [r[0] for r in run(f"SELECT file FROM papers_raw WHERE file NOT IN (SELECT file FROM {table}) ORDER BY 1").fetchall() if want(r[0])]

failed = []
def attempt(step, f, fn):
    try:
        fn()
        print(step, f[:70], flush=True)
    except Exception as e:
        failed.append((step, f))
        print(step.upper(), "FAILED", f[:70], str(e).split("\n")[0][:160], flush=True)

# 1. pages (one parse per file; failures are reported and skipped)
for f in missing("paper_pages"):
    attempt("parsed", f, lambda: run("""INSERT INTO paper_pages
               SELECT %s, p.value:index::INT + 1, p.value:content::STRING
               FROM LATERAL FLATTEN(TRY_PARSE_JSON(TO_VARCHAR(
                    AI_PARSE_DOCUMENT(TO_FILE('@papers', %s), {'mode':'LAYOUT','page_split':true})))['pages']) p""", f, f))

# 2. whole-paper text, rebuilt from pages (covers every file)
run("""CREATE OR REPLACE TABLE papers_raw AS
       SELECT file, LISTAGG(text, '\n\n') WITHIN GROUP (ORDER BY page) AS text FROM paper_pages GROUP BY file""")

# Steps 3-4b are set-based: one statement over every missing file, so Snowflake parallelises the AI calls across rows.
def quoted(files):
    return ",".join("'" + f.replace("'", "''") + "'" for f in files)

def batch(step, files, sql_for):
    """Run sql_for(file_list) once for all files; if the batch fails, fall back to one statement per file."""
    if not files:
        return
    try:
        run(sql_for(files)); print(step, len(files), "files (batched)", flush=True)
    except Exception as e:
        print(step.upper(), "BATCH FAILED, retrying per file:", str(e).split("\n")[0][:160], flush=True)
        for f in files:
            attempt(step, f, lambda: run(sql_for([f])))

# 3. chunks + embeddings
files = [r[0] for r in run("SELECT file FROM papers_raw WHERE file NOT IN (SELECT file FROM chunks) ORDER BY 1").fetchall() if want(r[0])]
batch("chunked", files, lambda fl: f"""INSERT INTO chunks
    SELECT r.file, c.index, c.value::STRING, AI_EMBED('snowflake-arctic-embed-m-v1.5', c.value::STRING)
    FROM papers_raw r, LATERAL FLATTEN(SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(r.text, 'markdown', 1500, 200)) c
    WHERE r.file IN ({quoted(fl)})""")

# 4. library cards + citation metadata
CARD_PROMPT = "Return ONLY valid JSON, no markdown fences, with keys title, year, one_line, method, key_finding, limitations (each under 40 words).\n\n"
META_PROMPT = ("Return ONLY JSON, no markdown fences, with keys: title (string), authors (array of full names exactly as printed on the paper, max 12), "
               "year (4-digit publication year as a string, or \"\" if unknown), "
               "venue (journal or conference name exactly as printed, or \"\" if unknown), "
               "family (a 2-3 word topic label such as \"Clinical LLMs\" or \"Medical image segmentation\"). "
               "Ignore any database cover page or download notice that precedes the paper itself.\n\n")
esc = lambda t: t.replace("\\", "\\\\").replace("'", "''")
for table, col, prompt, n, step in (("paper_cards", "card", CARD_PROMPT, 12000, "carded"), ("paper_meta", "meta", META_PROMPT, 9000, "described")):
    batch(step, todo(table, col), lambda fl: f"""INSERT INTO {table} SELECT file, TRY_PARSE_JSON(REGEXP_REPLACE(TO_VARCHAR(
        AI_COMPLETE('{MODEL}', '{esc(prompt)}' || LEFT(text, {n}))), '```(json)?', '')) FROM papers_raw WHERE file IN ({quoted(fl)})""")
# every meta row (old ones too) gets source = team|arxiv; idempotent
ARX = "'^(\\\\d{4}\\\\.\\\\d{4,5}v\\\\d+_|[a-z\\\\-]+_\\\\d{7}v\\\\d+_).*'"
run(f"""UPDATE paper_meta SET meta = OBJECT_INSERT(COALESCE(meta, OBJECT_CONSTRUCT()), 'source', IFF(REGEXP_LIKE(file, {ARX}), 'arxiv', 'team'), TRUE)
        WHERE COALESCE(meta:source::STRING, '') <> IFF(REGEXP_LIKE(file, {ARX}), 'arxiv', 'team')""")

# 4b. one consistent topic per paper, from a fixed list (these become the "collections" in the app)
FAMILIES = ["Clinical language models", "Medical imaging", "Hallucination and safety", "Clinical decision support",
            "Question answering and retrieval", "Drug discovery and biology", "Pathology", "Privacy and federated learning",
            "Health informatics and policy", "Clinical studies and evidence", "Other"]
rows = [r for r in run("""SELECT m.file, COALESCE(m.meta:title::STRING, ''), COALESCE(c.card:one_line::STRING, '')
                          FROM paper_meta m LEFT JOIN paper_cards c ON c.file = m.file
                          WHERE COALESCE(m.meta:family::STRING, '') NOT IN (%s)""" % ",".join("'%s'" % x for x in FAMILIES)).fetchall() if want(r[0])]
if rows:
    run("CREATE OR REPLACE TEMP TABLE _fam (file STRING, title STRING, line STRING)")
    cur.executemany("INSERT INTO _fam VALUES (%s, %s, %s)", rows)
    head = "Pick the single best topic for this paper from the list. Reply with exactly one item from the list, nothing else.\n" + "\n".join("- " + x for x in FAMILIES)
    replies = run("SELECT file, LOWER(AI_COMPLETE(%s, %s || '\n\nTitle: ' || title || '\nSummary: ' || line)) FROM _fam", MODEL, head).fetchall()
    for f, reply in replies:
        fam = next((x for x in FAMILIES if x.lower() in (reply or "")), "Other")
        attempt("topic", f, lambda: run("UPDATE paper_meta SET meta = OBJECT_INSERT(COALESCE(meta, OBJECT_CONSTRUCT()), 'family', %s, TRUE) WHERE file = %s", fam, f))
print("topics:", run("SELECT meta:family::STRING, COUNT(*) FROM paper_meta GROUP BY 1 ORDER BY 2 DESC").fetchall())

# 5. rebuild the search index over all chunks
run("""CREATE OR REPLACE CORTEX SEARCH SERVICE papers_search ON chunk ATTRIBUTES file, chunk_id
       WAREHOUSE = COMPUTE_WH TARGET_LAG = '1 hour' AS (SELECT file, chunk_id, chunk FROM chunks)""")
for t in ("paper_pages", "papers_raw", "chunks", "paper_cards", "paper_meta"):
    print(t, run(f"SELECT COUNT(DISTINCT file) FROM {t}").fetchone()[0], "papers")
print("null cards:", run("SELECT COUNT(*) FROM paper_cards WHERE card IS NULL").fetchone()[0],
      "| null meta:", run("SELECT COUNT(*) FROM paper_meta WHERE meta IS NULL").fetchone()[0])
print("FAILED:", failed if failed else "none")
