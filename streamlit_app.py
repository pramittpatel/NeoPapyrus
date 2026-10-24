"""PaperCourt - cited Q&A over AI-in-medicine papers. Runs in Streamlit in Snowflake."""
import json
import streamlit as st

try:  # inside Streamlit in Snowflake
    from snowflake.snowpark.context import get_active_session
    session = get_active_session()
except Exception:  # local run: creds from .env
    import os
    from dotenv import load_dotenv
    from snowflake.snowpark import Session
    load_dotenv()
    session = Session.builder.configs({
        "account": os.environ["SNOWFLAKE_ACCOUNT"], "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"], "role": "ACCOUNTADMIN",
        "warehouse": "COMPUTE_WH", "database": "PAPERCOURT", "schema": "PUBLIC"}).create()
SERVICE = "PAPERCOURT.PUBLIC.papers_search"
MODELS = ["llama3.3-70b", "claude-sonnet-4-5", "openai-gpt-5"]  # first one that works is used
DISCLAIMER = "Research aid only. Not medical advice."


def q(sql, params=None):
    return session.sql(sql, params=params).collect()


@st.cache_resource
def pick_model():
    for m in MODELS:
        try:
            q("SELECT AI_COMPLETE(?, 'ping')", [m])
            return m
        except Exception:
            continue
    raise RuntimeError("No Cortex model available; see setup.sql block 1")


def complete(prompt):
    r = q("SELECT AI_COMPLETE(?, ?) AS r", [pick_model(), prompt])[0]["R"]
    try:  # AI_COMPLETE returns a JSON-quoted string
        return json.loads(r) if isinstance(json.loads(r), str) else r
    except ValueError:
        return r


@st.cache_data(show_spinner=False)
def retrieve(question, k=6, file=None):
    req = {"query": question, "columns": ["file", "chunk_id", "chunk"], "limit": k}
    if file:
        req["filter"] = {"@eq": {"file": file}}
    raw = q("SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(?, ?) AS r", [SERVICE, json.dumps(req)])[0]["R"]
    return json.loads(raw)["results"]


def context_block(hits):
    return "\n\n".join(f"[{i+1}] ({h['file']})\n{h['chunk']}" for i, h in enumerate(hits))


def log(tab, question, hits):
    q("INSERT INTO question_log(tab, question, model, papers) SELECT ?, ?, ?, PARSE_JSON(?)",
      [tab, question, pick_model(), json.dumps(sorted({h["file"] for h in hits}))])


RULES = ("Answer ONLY from the numbered excerpts. Cite every claim like [1]. "
         "If the excerpts don't contain the answer, say so. Be concise.")

st.title("PaperCourt")
st.caption(DISCLAIMER)
ask_t, debate_t, gaps_t, lib_t, ins_t = st.tabs(["Ask", "Debate", "Gaps", "Library", "Insights"])

with ask_t:
    question = st.text_input("Question", placeholder="Can hallucination be fully eliminated?")
    level = st.select_slider("Explain like I'm a", ["High-schooler", "Undergrad", "PhD"], value="Undergrad")
    if question:
        hits = retrieve(question)
        st.write(complete(f"{RULES} Explain at a {level} level.\n\nExcerpts:\n{context_block(hits)}\n\nQuestion: {question}"))
        st.subheader("Paper verdicts")
        for f in sorted({h["file"] for h in hits}):
            ex = context_block([h for h in hits if h["file"] == f])
            v = complete("Given the excerpts, how useful is this paper for the question? Reply with exactly one "
                         f"word: MUST_READ, RELATED or SKIP.\nQuestion: {question}\n{ex}").upper()
            badge = "🟢 Must Read" if "MUST" in v else "🔴 Skip" if "SKIP" in v else "🟡 Related"
            st.markdown(f"{badge} · {f}")
        with st.expander("Sources used"):
            for i, h in enumerate(hits):
                st.markdown(f"**[{i+1}] {h['file']}** (chunk {h['chunk_id']})")
                st.caption(h["chunk"][:600])
        log("Ask", question, hits)

files = [r["FILE"] for r in q("SELECT DISTINCT file FROM chunks ORDER BY file")]

with debate_t:
    c1, c2 = st.columns(2)
    a, b = c1.selectbox("Paper A", files, key="da"), c2.selectbox("Paper B", files, index=min(1, len(files)-1), key="db")
    dq = st.text_input("Debate question", key="dq")
    if dq and st.button("Convene court"):
        ha, hb = retrieve(dq, 4, a), retrieve(dq, 4, b)
        pa = complete(f"You are paper A's advocate. {RULES}\nExcerpts:\n{context_block(ha)}\nQuestion: {dq}")
        pb = complete(f"You are paper B's advocate. {RULES}\nExcerpts:\n{context_block(hb)}\nQuestion: {dq}")
        verdict = complete(f"Judge. Summarize where A and B agree/disagree, using only these arguments; "
                           f"do not add facts.\nA: {pa}\nB: {pb}")
        c1.markdown(pa); c2.markdown(pb); st.subheader("Verdict"); st.write(verdict)
        log("Debate", dq, ha + hb)

with gaps_t:
    topic = st.text_input("Topic", key="gt")
    if topic:
        hits = retrieve(topic, 10)
        st.write(complete("From the excerpts only, list (1) what papers agree on, (2) where they disagree, "
                          "(3) open research gaps. Cite [n]. Don't invent.\n\n" + context_block(hits)))
        log("Gaps", topic, hits)

with lib_t:
    for r in q("SELECT file, card FROM paper_cards ORDER BY file"):
        c = json.loads(r["CARD"]) if r["CARD"] else {}
        with st.expander(c.get("title") or r["FILE"]):
            st.json(c) if c else st.caption("No card (JSON parse failed)")

with ins_t:
    st.dataframe(q("SELECT tab, COUNT(*) AS n FROM question_log GROUP BY tab"))
    st.dataframe(q("SELECT ts, tab, question FROM question_log ORDER BY ts DESC LIMIT 20"))
