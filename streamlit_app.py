# PaperCourt: papers argue, you learn.
# Paste this whole file into a Streamlit in Snowflake app (database RESEARCH_DB, schema PUBLIC).
import json

import streamlit as st
from snowflake.snowpark.context import get_active_session

st.set_page_config(page_title="PaperCourt", page_icon="⚖️", layout="wide")
session = get_active_session()

DB = "RESEARCH_DB.PUBLIC"
EMBED_MODEL = "snowflake-arctic-embed-m-v1.5"

# ---------------------------------------------------------------- sidebar
with st.sidebar:
    st.title("⚖️ PaperCourt")
    st.caption("Papers argue. You learn.")
    MODEL = st.selectbox(
        "AI model",
        ["llama3.3-70b", "llama4-maverick", "claude-sonnet-4-5", "llama3.1-8b"],
        help="llama3.3-70b is tested on our account. If a model errors, pick another.",
    )
    st.caption("Parsing, search and AI all run inside Snowflake Cortex.")


# ---------------------------------------------------------------- helpers
@st.cache_data(show_spinner=False)
def llm(prompt, model):
    """Send a prompt to a Cortex model and return its text answer.
    Cached: the same prompt twice returns instantly (great for demos)."""
    row = session.sql(
        "SELECT AI_COMPLETE(?, ?) AS R", params=[model, prompt]
    ).collect()[0]
    return row["R"]


@st.cache_data(show_spinner=False)
def search(question, k=6, file=None):
    """Return the k chunks most similar to the question (optionally from one paper)."""
    where = "WHERE file = ?" if file else ""
    params = ([file] if file else []) + [question]
    rows = session.sql(
        f"""
        SELECT file, chunk_id, chunk
        FROM {DB}.chunks {where}
        ORDER BY VECTOR_COSINE_SIMILARITY(
            emb, AI_EMBED('{EMBED_MODEL}', ?)) DESC
        LIMIT {int(k)}
        """,
        params=params,
    ).collect()
    return [r.as_dict() for r in rows]


@st.cache_data(show_spinner=False)
def load_papers():
    """List of paper files, plus a library card (dict) for each one."""
    files = [r["FILE"] for r in session.sql(
        f"SELECT DISTINCT file FROM {DB}.chunks ORDER BY file").collect()]
    cards = {}
    try:
        for r in session.sql(f"SELECT file, card FROM {DB}.paper_cards").collect():
            try:
                c = json.loads(r["CARD"]) if r["CARD"] else {}
            except Exception:
                c = {}
            cards[r["FILE"]] = c if isinstance(c, dict) else {}
    except Exception:
        pass  # paper_cards table missing: app still works
    return files, cards


def name(file):
    """Nice paper title if we have one, otherwise the file name."""
    return CARDS.get(file, {}).get("title") or file


def context(rows):
    """Turn search results into a text block the AI can cite."""
    return "\n\n".join(
        f"[{name(r['FILE'])}, chunk {r['CHUNK_ID']}]\n{r['CHUNK']}" for r in rows
    )


def log_question(tab, question, papers):
    """Save every question to a table. Powers the Insights tab. Never breaks the app."""
    try:
        session.sql(
            f"INSERT INTO {DB}.question_log (tab, question, model, papers) "
            "SELECT ?, ?, ?, PARSE_JSON(?)",
            params=[tab, question, MODEL, json.dumps(sorted(set(papers)))],
        ).collect()
    except Exception:
        pass  # question_log table missing: skip logging


def parse_json_list(text):
    """Pull a JSON list out of an AI answer. Returns None if it can't."""
    try:
        return json.loads(text[text.find("["): text.rfind("]") + 1])
    except Exception:
        return None


FILES, CARDS = load_papers()
if not FILES:
    st.error("No papers found. Run setup.sql (blocks 1-5) first, then reload this app.")
    st.stop()

ask_tab, lib_tab, debate_tab, gap_tab, stats_tab = st.tabs(
    ["🔎 Ask", "📚 Library", "⚔️ Debate", "🧭 Research Gaps", "📈 Insights"]
)

# ---------------------------------------------------------------- 1. Ask
with ask_tab:
    st.header("Ask your papers")
    level = st.select_slider(
        "Explain it for a…", ["High-schooler", "Undergrad", "PhD"], value="Undergrad"
    )
    q = st.text_input("Your question", key="ask_q",
                      placeholder="Are large language models accurate enough to help with diagnosis?")

    if st.button("Ask", type="primary", key="ask_btn") and q:
        with st.spinner("Searching the papers and writing an answer…"):
            rows = search(q, 8)
            answer = llm(f"""You are a careful research assistant. Answer for a {level} reader.
Use ONLY the excerpts below. After each claim, cite the source like [Paper title, chunk N].
If the excerpts do not answer the question, say "These papers don't cover this."

EXCERPTS:
{context(rows)}

QUESTION: {q}""", MODEL)
            verdict_raw = llm(f"""Question: "{q}"
For each distinct paper in the excerpts below, judge how useful it is for this question.
Return ONLY a JSON list, nothing else, like:
[{{"paper": "Paper title", "verdict": "Must Read", "reason": "One sentence."}}]
verdict must be exactly one of: Must Read, Related, Skip.

EXCERPTS:
{context(rows)}""", MODEL)
        st.session_state["ask"] = {"answer": answer, "verdicts": verdict_raw, "rows": rows}
        log_question("Ask", q, [name(r["FILE"]) for r in rows])

    if "ask" in st.session_state:
        res = st.session_state["ask"]
        left, right = st.columns([3, 2])
        with left:
            st.subheader("Answer")
            st.markdown(res["answer"])
        with right:
            st.subheader("Should you read it?")
            verdicts = parse_json_list(res["verdicts"])
            icons = {"Must Read": "🟢", "Related": "🟡", "Skip": "🔴"}
            if verdicts:
                for v in verdicts:
                    if not isinstance(v, dict):
                        continue
                    verdict = v.get("verdict", "Related")
                    st.markdown(
                        f"{icons.get(verdict, '⚪')} **{verdict}** · {v.get('paper', '')}  \n"
                        f"<small>{v.get('reason', '')}</small>",
                        unsafe_allow_html=True,
                    )
            else:
                st.markdown(res["verdicts"])  # AI didn't return clean JSON: show it raw
        with st.expander("📄 Sources used (proof the answer comes from the papers)"):
            for r in res["rows"]:
                st.markdown(f"**{name(r['FILE'])}** · chunk {r['CHUNK_ID']}")
                st.caption(r["CHUNK"][:600] + "…")

# ---------------------------------------------------------------- 2. Library
with lib_tab:
    st.header("Paper library")
    st.caption(f"{len(FILES)} papers loaded")
    for f in FILES:
        c = CARDS.get(f, {})
        label = f"{name(f)}" + (f" ({c.get('year')})" if c.get("year") else "")
        with st.expander(label):
            if not c:
                st.write("No library card for this paper yet (re-run block 7 of setup.sql).")
                continue
            st.markdown(f"**In one line:** {c.get('one_line', '-')}")
            st.markdown(f"**Method:** {c.get('method', '-')}")
            st.markdown(f"**Key finding:** {c.get('key_finding', '-')}")
            st.markdown(f"**Limitations:** {c.get('limitations', '-')}")
            st.caption(f"File: {f}")

# ---------------------------------------------------------------- 3. Debate
with debate_tab:
    st.header("⚔️ Paper Debate")
    st.caption("Two papers argue. Each side may only use its own paper's text. A judge rules.")
    c1, c2 = st.columns(2)
    a = c1.selectbox("🟦 Paper A", FILES, format_func=name, key="deb_a")
    b = c2.selectbox("🟥 Paper B", FILES, index=min(1, len(FILES) - 1),
                     format_func=name, key="deb_b")
    dq = st.text_input("What should they argue about?", key="deb_q",
                       placeholder="Is AI ready for everyday use in hospitals?")

    if st.button("Start the debate", type="primary", key="deb_btn"):
        if a == b:
            st.warning("Pick two different papers.")
        elif not dq:
            st.warning("Type a question first.")
        else:
            with st.spinner("The lawyers are preparing their arguments…"):
                st.session_state["debate"] = llm(f"""You are running a courtroom debate between two research papers.
The question: "{dq}"

EVIDENCE FOR PAPER A ({name(a)}):
{context(search(dq, 4, a))}

EVIDENCE FOR PAPER B ({name(b)}):
{context(search(dq, 4, b))}

Rules: each lawyer may ONLY use their own paper's evidence and must cite chunks like [title, chunk N].
Be lively but accurate. Never invent results that are not in the evidence.

Write these Markdown sections:
### 🟦 Opening statement: {name(a)}
### 🟥 Opening statement: {name(b)}
### ⚔️ Rebuttals
(Each side answers the other in 2-3 sentences.)
### ⚖️ Judge's ruling
(Which paper has stronger evidence on THIS question and why, 3-4 sentences.)
### ❓ Still unresolved
(2-3 questions neither paper settles.)""", MODEL)
                log_question("Debate", dq, [name(a), name(b)])

    if "debate" in st.session_state:
        st.markdown(st.session_state["debate"])

# ---------------------------------------------------------------- 4. Research gaps
with gap_tab:
    st.header("🧭 Research Gap Finder")
    st.caption("Where the papers agree, where they clash, and what nobody has answered yet.")
    topic = st.text_input("Topic", key="gap_q", placeholder="AI for clinical diagnosis")

    if st.button("Find gaps", type="primary", key="gap_btn") and topic:
        with st.spinner("Comparing papers…"):
            gap_rows = search(topic, 12)
            log_question("Gaps", topic, [name(r["FILE"]) for r in gap_rows])
            st.session_state["gaps"] = llm(f"""You are helping a student plan research on "{topic}".
Using ONLY the excerpts below (from several different papers), write these Markdown sections:
### ✅ Where the papers agree
### ⚡ Where they disagree
### 🧭 3 open research questions
(Questions none of these papers answers. For each: one sentence on why it matters
and one sentence on how a student could start testing it.)
Cite [title, chunk N] for every claim.

EXCERPTS:
{context(gap_rows)}""", MODEL)

    if "gaps" in st.session_state:
        st.markdown(st.session_state["gaps"])

# ---------------------------------------------------------------- 5. Insights
with stats_tab:
    st.header("📈 Insights")
    st.caption("Every question is stored in Snowflake. This tab analyses them with SQL and AI.")
    try:
        total = session.sql(f"SELECT COUNT(*) AS N FROM {DB}.question_log").collect()[0]["N"]
    except Exception:
        st.info("Run Block 8 of setup.sql to turn on Insights.")
        total = None

    if total == 0:
        st.info("No questions yet. Ask something in the other tabs, then come back.")
    elif total:
        m1, m2 = st.columns(2)
        m1.metric("Questions asked", total)
        m2.metric("Papers in library", len(FILES))

        st.subheader("Most-cited papers")
        top = session.sql(f"""
            SELECT f.value::STRING AS PAPER, COUNT(*) AS TIMES_USED
            FROM {DB}.question_log, LATERAL FLATTEN(papers) f
            GROUP BY 1 ORDER BY 2 DESC LIMIT 10""").to_pandas()
        st.bar_chart(top.set_index("PAPER"))

        st.subheader("Recent questions")
        recent = session.sql(f"""
            SELECT ts AS TIME, tab AS TAB, question AS QUESTION
            FROM {DB}.question_log ORDER BY ts DESC LIMIT 15""").to_pandas()
        st.dataframe(recent, use_container_width=True, hide_index=True)

        if st.button("🧠 What are people curious about?", key="themes_btn"):
            qs = "\n".join(f"- {x}" for x in recent["QUESTION"].tolist())
            with st.spinner("Reading the questions…"):
                st.markdown(llm(f"""Here are recent questions researchers asked about a set of papers:
{qs}

Group them into 3-4 themes. For each theme: a short name, one sentence describing it,
and one paper topic the library is missing that would help answer it.""", MODEL))
