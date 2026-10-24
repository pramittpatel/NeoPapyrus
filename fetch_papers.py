"""Download open-access AI-in-medicine PDFs from arXiv into ./papers. Resumable; polite (arXiv asks for >=3s between requests).

usage: python fetch_papers.py [per_query=8] [max_mb=20]
"""
import re, sys, time, urllib.error, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

QUERIES = [
    'all:"large language model" AND all:clinical',
    'all:"deep learning" AND all:"medical imaging"',
    'all:"retrieval augmented generation" AND all:medical',
    'all:"clinical decision support" AND all:"machine learning"',
    'all:hallucination AND all:medical AND all:LLM',
    'all:"drug discovery" AND all:"machine learning"',
    'all:"electronic health records" AND all:prediction',
    'all:"radiology report" AND all:generation',
    'all:"medical question answering" AND all:language model',
    'all:"federated learning" AND all:healthcare',
    'all:"computational pathology" AND all:"deep learning"',
    'all:"medical vision-language" AND all:model',
    'all:"clinical trial" AND all:"language model"',
    'all:"protein structure" AND all:"deep learning"',
]
PER_QUERY = int(sys.argv[1]) if len(sys.argv) > 1 else 8
MAX_BYTES = int(sys.argv[2]) * 1_000_000 if len(sys.argv) > 2 else 20_000_000
NS = {"a": "http://www.w3.org/2005/Atom"}
UA = {"User-Agent": "research-paper-assistant/0.1 (hackathon; polite crawler)"}
out = Path(__file__).parent / "papers"; out.mkdir(exist_ok=True)
have = {p.name.split("_")[0].split("v")[0] for p in out.glob("*.pdf")}


def get(url, timeout=60):
    for wait in (10, 30, 90, 0):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or not wait:
                raise
            print(f"  429, waiting {wait}s", flush=True); time.sleep(wait)


for q in QUERIES:
    url = "http://export.arxiv.org/api/query?" + urllib.parse.urlencode(
        {"search_query": q, "max_results": PER_QUERY, "sortBy": "relevance"})
    try:
        root = ET.fromstring(get(url, 30))
    except Exception as ex:
        print("query failed:", q, ex, flush=True); time.sleep(10); continue
    time.sleep(4)
    for e in root.findall("a:entry", NS):
        aid = e.find("a:id", NS).text.rsplit("/abs/", 1)[1]
        if re.sub(r"v\d+$", "", aid) in have:
            continue
        title = re.sub(r"\s+", " ", e.find("a:title", NS).text).strip()
        slug = re.sub(r"[^A-Za-z0-9]+", "_", title)[:60].strip("_")
        dest = out / f"{aid.replace('/', '_')}_{slug}.pdf"
        try:
            data = get(f"https://arxiv.org/pdf/{aid}")
            if len(data) > MAX_BYTES or not data.startswith(b"%PDF"):
                print("skip (size/format)", aid, flush=True)
            else:
                dest.write_bytes(data); have.add(re.sub(r"v\d+$", "", aid)); print("saved", dest.name, flush=True)
        except Exception as ex:
            print("skip", aid, ex, flush=True)
        time.sleep(4)
print("done:", len(list(out.glob('*.pdf'))), "pdfs", flush=True)
