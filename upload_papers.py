"""Upload ./papers/*.pdf to @PAPERCOURT.PUBLIC.PAPERS. Reads creds from env (.env)."""
import os, sys, glob
import snowflake.connector
from dotenv import load_dotenv
load_dotenv()
con = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
    password=os.environ["SNOWFLAKE_PASSWORD"], role=os.getenv("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"), database="PAPERCOURT", schema="PUBLIC")
cur = con.cursor()
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "papers", "*.pdf"))):
    cur.execute(f"PUT 'file://{f}' @papers AUTO_COMPRESS=FALSE OVERWRITE=FALSE")
    print("uploaded", os.path.basename(f))
cur.execute("ALTER STAGE papers REFRESH")
