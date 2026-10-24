import snowflake from "snowflake-sdk";

snowflake.configure({ logLevel: "OFF" });

let conn: Promise<snowflake.Connection> | null = null;

function connect() {
  return new Promise<snowflake.Connection>((resolve, reject) => {
    const c = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USER!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      role: process.env.SNOWFLAKE_ROLE ?? "ACCOUNTADMIN",
      warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH",
      database: "PAPERCOURT",
      schema: "PUBLIC",
      clientSessionKeepAlive: true,
    });
    c.connect((err, ok) => (err ? reject(err) : resolve(ok)));
  });
}

function run<T>(c: snowflake.Connection, sqlText: string, binds: snowflake.Binds) {
  return new Promise<T[]>((resolve, reject) => {
    c.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
    });
  });
}

/** Run one statement; reconnects once if the session has gone stale. */
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: snowflake.Binds = [],
): Promise<T[]> {
  conn ??= connect();
  try {
    return await run<T>(await conn, sqlText, binds);
  } catch (e) {
    const code = (e as { code?: number | string }).code;
    if (String(code) === "390114" || String(code) === "407002") {
      conn = connect();
      return run<T>(await conn, sqlText, binds);
    }
    conn = null;
    throw e;
  }
}
