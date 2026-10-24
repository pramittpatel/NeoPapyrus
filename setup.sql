-- PaperCourt setup (AI Functions: AI_PARSE_DOCUMENT / AI_EMBED / AI_COMPLETE).
-- New accounts are blocked from legacy SNOWFLAKE.CORTEX.COMPLETE/EMBED/PARSE functions.
-- Run all at once with: python run_sql.py setup.sql   (or one block at a time in Snowsight)

-- BLOCK 1: test the AI. Working here: llama3.3-70b, llama3.1-70b/8b, claude-sonnet-4-5, claude-haiku-4-5, openai-gpt-5.
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE COMPUTE_WH;
SELECT AI_COMPLETE('llama3.3-70b', 'Say hello in 5 words');

-- BLOCK 2: database + stage (upload PDFs with: python upload_papers.py)
CREATE DATABASE IF NOT EXISTS PAPERCOURT;
USE DATABASE PAPERCOURT;
USE SCHEMA PUBLIC;
CREATE STAGE IF NOT EXISTS papers DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

-- BLOCK 3: confirm
ALTER STAGE papers REFRESH;
SELECT relative_path, size FROM DIRECTORY(@papers);

-- BLOCK 4: PDF -> text
CREATE OR REPLACE TABLE papers_raw AS
SELECT relative_path AS file,
       TRY_PARSE_JSON(TO_VARCHAR(AI_PARSE_DOCUMENT(TO_FILE('@papers', relative_path), {'mode': 'LAYOUT'})))['content']::STRING AS text
FROM DIRECTORY(@papers);
SELECT file, LENGTH(text) AS characters FROM papers_raw ORDER BY file;

-- BLOCK 5: chunks + embeddings (kept for the manual vector-search fallback)
CREATE OR REPLACE TABLE chunks AS
SELECT r.file, c.index AS chunk_id, c.value::STRING AS chunk,
       AI_EMBED('snowflake-arctic-embed-m-v1.5', c.value::STRING) AS emb
FROM papers_raw r,
     LATERAL FLATTEN(SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(r.text, 'markdown', 1500, 200)) c
WHERE r.text IS NOT NULL;
SELECT file, COUNT(*) AS chunk_count FROM chunks GROUP BY file ORDER BY file;

-- BLOCK 5b: managed Cortex Search Service (hybrid keyword + vector). Main retrieval path.
CREATE OR REPLACE CORTEX SEARCH SERVICE papers_search
  ON chunk
  ATTRIBUTES file, chunk_id
  WAREHOUSE = COMPUTE_WH
  TARGET_LAG = '1 hour'
AS (SELECT file, chunk_id, chunk FROM chunks);

-- BLOCK 6: library cards
CREATE OR REPLACE TABLE paper_cards AS
SELECT file, TRY_PARSE_JSON(AI_COMPLETE('llama3.3-70b',
  'Return ONLY valid JSON, no markdown fences, with keys title, year, one_line, method, key_finding, limitations (each under 40 words).\n\n' || LEFT(text, 12000))) AS card
FROM papers_raw WHERE text IS NOT NULL;

-- BLOCK 7: question log
CREATE TABLE IF NOT EXISTS question_log (
  ts TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(), tab STRING, question STRING, model STRING, papers ARRAY);

-- BLOCK 8: citation metadata (title, authors, topic label) for the web app's evidence matrix and citations
CREATE OR REPLACE TABLE paper_meta AS
SELECT file,
       TRY_PARSE_JSON(REGEXP_REPLACE(TO_VARCHAR(AI_COMPLETE('llama3.3-70b',
         'Return ONLY JSON, no markdown fences, with keys: title (string), authors (array of full names exactly as printed on the paper, max 12), family (a 2-3 word topic label such as "Clinical LLMs" or "Medical image segmentation").\n\n' || LEFT(text, 6000))),
         '```(json)?', '')) AS meta
FROM papers_raw WHERE text IS NOT NULL;
