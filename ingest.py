"""Incrementally index PDFs already uploaded to @papers: pages -> papers_raw -> chunks -> cards/meta -> search service.

Only files missing from each table are processed, so re-running after `upload_papers.py` is cheap.
usage: python ingest.py            (creds from .env)
"""
import os, sys, warnings
warnings.filterwarnings("ignore")
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()
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

def missing(table):
    return [r[0] for r in run(
        f"SELECT relative_path FROM DIRECTORY(@papers) WHERE relative_path NOT IN (SELECT file FROM {table}) ORDER BY 1").fetchall()]

# 1. pages (one parse per file; failures are reported and skipped)
for f in missing("paper_pages"):
    try:
        run("""INSERT INTO paper_pages
               SELECT %s, p.value:index::INT + 1, p.value:content::STRING
               FROM LATERAL FLATTEN(TRY_PARSE_JSON(TO_VARCHAR(
                    AI_PARSE_DOCUMENT(TO_FILE('@papers', %s), {'mode':'LAYOUT','page_split':true})))['pages']) p""", f, f)
        print("parsed", f[:70], flush=True)
    except Exception as e:
        print("PARSE FAILED", f[:70], str(e).split("\n")[0][:120], flush=True)

# 2. whole-paper text, rebuilt from pages
run("""CREATE OR REPLACE TABLE papers_raw AS
       SELECT file, LISTAGG(text, '\n\n') WITHIN GROUP (ORDER BY page) AS text FROM paper_pages GROUP BY file""")

# 3. chunks + embeddings for new papers
new = [r[0] for r in run("SELECT file FROM papers_raw WHERE file NOT IN (SELECT file FROM chunks)").fetchall()]
for f in new:
    run("""INSERT INTO chunks
           SELECT r.file, c.index, c.value::STRING, AI_EMBED('snowflake-arctic-embed-m-v1.5', c.value::STRING)
           FROM papers_raw r, LATERAL FLATTEN(SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(r.text, 'markdown', 1500, 200)) c
           WHERE r.file = %s""", f)
    print("chunked", f[:70], flush=True)

# 4. library cards + citation metadata for new papers
for f in [r[0] for r in run("SELECT file FROM papers_raw WHERE file NOT IN (SELECT file FROM paper_cards)").fetchall()]:
    run("""INSERT INTO paper_cards SELECT file, TRY_PARSE_JSON(REGEXP_REPLACE(TO_VARCHAR(AI_COMPLETE(%s,
           'Return ONLY valid JSON, no markdown fences, with keys title, year, one_line, method, key_finding, limitations (each under 40 words).\n\n' || LEFT(text, 12000))), '```(json)?', ''))
           FROM papers_raw WHERE file = %s""", MODEL, f)
for f in [r[0] for r in run("SELECT file FROM papers_raw WHERE file NOT IN (SELECT file FROM paper_meta)").fetchall()]:
    run("""INSERT INTO paper_meta SELECT file, TRY_PARSE_JSON(REGEXP_REPLACE(TO_VARCHAR(AI_COMPLETE(%s,
           'Return ONLY JSON, no markdown fences, with keys: title (string), authors (array of full names exactly as printed on the paper, max 12), family (a 2-3 word topic label such as "Clinical LLMs" or "Medical image segmentation").\n\n' || LEFT(text, 6000))), '```(json)?', ''))
           FROM papers_raw WHERE file = %s""", MODEL, f)
    print("described", f[:70], flush=True)

# 4b. one consistent topic per paper, from a fixed list (these become the "collections" in the app)
FAMILIES = ["Clinical language models", "Medical imaging", "Hallucination and safety", "Clinical decision support",
            "Question answering and retrieval", "Drug discovery and biology", "Pathology", "Privacy and federated learning", "Other"]
for f, title, line in run("""SELECT m.file, COALESCE(m.meta:title::STRING, ''), COALESCE(c.card:one_line::STRING, '')
                             FROM paper_meta m LEFT JOIN paper_cards c ON c.file = m.file
                             WHERE COALESCE(m.meta:family::STRING, '') NOT IN (%s)""" % ",".join("'%s'" % x for x in FAMILIES)).fetchall():
    reply = run("SELECT AI_COMPLETE(%s, %s)", MODEL,
                "Pick the single best topic for this paper from the list. Reply with exactly one item from the list, nothing else.\n"
                + "\n".join("- " + x for x in FAMILIES) + f"\n\nTitle: {title}\nSummary: {line}").fetchone()[0].lower()
    fam = next((x for x in FAMILIES if x.lower() in reply), "Other")
    run("UPDATE paper_meta SET meta = OBJECT_INSERT(COALESCE(meta, OBJECT_CONSTRUCT()), 'family', %s, TRUE) WHERE file = %s", fam, f)
print("topics:", run("SELECT meta:family::STRING, COUNT(*) FROM paper_meta GROUP BY 1 ORDER BY 2 DESC").fetchall())

# 5. rebuild the search index over all chunks
run("""CREATE OR REPLACE CORTEX SEARCH SERVICE papers_search ON chunk ATTRIBUTES file, chunk_id
       WAREHOUSE = COMPUTE_WH TARGET_LAG = '1 hour' AS (SELECT file, chunk_id, chunk FROM chunks)""")
for t in ("paper_pages", "papers_raw", "chunks", "paper_cards", "paper_meta"):
    print(t, run(f"SELECT COUNT(DISTINCT file) FROM {t}").fetchone()[0], "papers")
print("null cards:", run("SELECT COUNT(*) FROM paper_cards WHERE card IS NULL").fetchone()[0],
      "| null meta:", run("SELECT COUNT(*) FROM paper_meta WHERE meta IS NULL").fetchone()[0])
