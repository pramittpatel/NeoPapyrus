"""Download open-access AI-in-medicine PDFs from arXiv into ./papers (freely redistributable to read/index)."""
import re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

QUERIES = [
    'all:"large language model" AND all:clinical',
    'all:"deep learning" AND all:"medical imaging"',
    'all:"retrieval augmented generation" AND all:medical',
    'all:"clinical decision support" AND all:"machine learning"',
    'all:hallucination AND all:medical AND all:LLM',
    'all:"drug discovery" AND all:"machine learning"',
]
PER_QUERY = int(sys.argv[1]) if len(sys.argv) > 1 else 6
NS = {"a": "http://www.w3.org/2005/Atom"}
out = Path(__file__).parent / "papers"; out.mkdir(exist_ok=True)

for q in QUERIES:
    url = "http://export.arxiv.org/api/query?" + urllib.parse.urlencode(
        {"search_query": q, "max_results": PER_QUERY, "sortBy": "relevance"})
    root = ET.fromstring(urllib.request.urlopen(url, timeout=30).read())
    for e in root.findall("a:entry", NS):
        aid = e.find("a:id", NS).text.rsplit("/abs/", 1)[1]
        title = re.sub(r"\s+", " ", e.find("a:title", NS).text).strip()
        slug = re.sub(r"[^A-Za-z0-9]+", "_", title)[:60].strip("_")
        dest = out / f"{aid.replace('/', '_')}_{slug}.pdf"
        if dest.exists(): continue
        try:
            req = urllib.request.Request(f"https://arxiv.org/pdf/{aid}", headers={"User-Agent": "ung-hack/0.1"})
            dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            print("saved", dest.name)
        except Exception as ex:
            print("skip", aid, ex)
        time.sleep(3)  # arXiv asks for 3s between requests
    time.sleep(3)
