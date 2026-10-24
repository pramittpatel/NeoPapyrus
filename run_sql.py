"""Run a .sql file statement by statement and print the first rows of each result. Creds from .env."""
import os, re, sys, warnings
warnings.filterwarnings("ignore")
import snowflake.connector
from dotenv import load_dotenv
load_dotenv()
con = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
    password=os.environ["SNOWFLAKE_PASSWORD"], role=os.getenv("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"))
cur = con.cursor()
text = "\n".join(l for l in open(sys.argv[1]) if not l.strip().startswith("--"))
for stmt in (s.strip() for s in text.split(";\n")):
    if not stmt.strip(";"):
        continue
    print(">>", " ".join(stmt.split())[:90])
    try:
        cur.execute(stmt)
        for row in cur.fetchmany(12):
            print("  ", tuple(str(v)[:70] for v in row))
    except Exception as e:
        print("   ERROR:", str(e).split("\n")[0][:300])
con.close()
