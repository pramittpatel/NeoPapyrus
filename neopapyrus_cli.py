"""Ask the papers from a terminal. Retrieval via the Python connector, answer via the Cortex REST API.

Env (.env): SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, SNOWFLAKE_PAT (REST),
SNOWFLAKE_ACCOUNT_URL, CORTEX_MODEL (default llama3.3-70b).
"""
import json, os, sys
import requests
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()
question = " ".join(sys.argv[1:]) or sys.exit("usage: python neopapyrus_cli.py 'your question'")
con = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
    password=os.environ["SNOWFLAKE_PASSWORD"], role=os.getenv("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"), database="PAPERCOURT", schema="PUBLIC")
req = {"query": question, "columns": ["file", "chunk_id", "chunk"], "limit": 6}
raw = con.cursor().execute("SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW('PAPERCOURT.PUBLIC.papers_search', %s)",
                           (json.dumps(req),)).fetchone()[0]
hits = json.loads(raw)["results"]
ctx = "\n\n".join(f"[{i+1}] ({h['file']})\n{h['chunk']}" for i, h in enumerate(hits))
prompt = ("Answer ONLY from the numbered excerpts. Cite every claim like [1]. If they don't contain the "
          f"answer, say so. Be concise.\n\nExcerpts:\n{ctx}\n\nQuestion: {question}")
resp = requests.post(
    f"{os.environ['SNOWFLAKE_ACCOUNT_URL'].rstrip('/')}/api/v2/cortex/inference:complete",
    headers={"Authorization": f"Bearer {os.environ['SNOWFLAKE_PAT']}",
             "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
             "Content-Type": "application/json", "Accept": "application/json"},
    json={"model": os.getenv("CORTEX_MODEL", "llama3.3-70b"), "stream": False,
          "messages": [{"role": "user", "content": prompt}]}, timeout=120)
resp.raise_for_status()
print(resp.json()["choices"][0]["message"]["content"])
print("\nSources:")
for i, h in enumerate(hits):
    print(f"[{i+1}] {h['file']} (chunk {h['chunk_id']})")
