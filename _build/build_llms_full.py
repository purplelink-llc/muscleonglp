"""Build llms-full.txt: every /learn/ article and calculator page as clean Markdown.

Keeps headings, paragraphs, list items, FAQ and references (with links);
drops nav, footer, forms, ads, scripts, inline SVG and the email-capture boxes.
Usage (from the repo root): python3 _build/build_llms_full.py .
"""
import html, re, sys
from html.parser import HTMLParser
from pathlib import Path

SKIP_TAGS = {"script", "style", "svg", "form", "nav", "footer", "header", "ins", "noscript", "button", "select", "textarea"}
SKIP_CLASSES = {"article-capture", "inline-capture", "subscribe-form", "gear", "article-cta", "calc-cta", "crumbs"}

class MD(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.stack, self.href, self.buf = [], 0, [], None, []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); cls = set((a.get("class") or "").split())
        skip = tag in SKIP_TAGS or bool(cls & SKIP_CLASSES)
        # <header class="article-hero"> holds the title and dek: keep it.
        if tag == "header" and "article-hero" in cls: skip = False
        self.stack.append((tag, skip))
        if skip: self.skip += 1; return
        if self.skip: return
        if tag in ("h1", "h2", "h3", "p", "li", "summary", "figcaption"): self.flush(); self.buf = []
        if tag == "a": self.href = a.get("href")
        if tag == "br": self.buf.append(" ")
        if tag == "sup": self.buf.append(" [")
    def handle_endtag(self, tag):
        while self.stack:
            t, skip = self.stack.pop()
            if skip: self.skip -= 1
            if t == tag: break
        if self.skip: return
        prefix = {"h1": "# ", "h2": "## ", "h3": "### ", "li": "- ", "summary": "**Q:** "}.get(tag)
        if tag in ("h1", "h2", "h3", "p", "li", "summary", "figcaption"):
            text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
            if text: self.out.append((prefix or "") + text)
            self.buf = []
        if tag == "a": self.href = None
        if tag == "sup": self.buf.append("]")
    def handle_data(self, data):
        if self.skip: return
        self.buf.append(data)
    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if text: self.out.append(text)
        self.buf = []

def page_md(path, url):
    t = path.read_text(encoding="utf-8")
    main = t[t.find("<main"):t.find("</main>")]
    p = MD(); p.feed(main); p.flush()
    upd = re.search(r'"dateModified":\s*"([^"]+)"', t)
    lines = [l for l in p.out if not re.fullmatch(r"(Updated .*|Evidence-based, every claim cited|Every figure cited|#)", l)]
    head = next((l for l in lines if l.startswith("# ")), "# " + url)
    body = "\n\n".join(l for l in lines if l != head)
    body = re.sub(r"\s+\[([0-9,\s\u2013-]+)\]", lambda m: " [" + re.sub(r"\s+", "", m.group(1)) + "]", body)
    return f"{head}\n\nURL: {url}\n" + (f"Updated: {upd.group(1)}\n" if upd else "") + f"\n{body}\n"

def main(site):
    site = Path(site)
    pages = sorted(site.glob("learn/*/index.html")) + sorted(p for p in site.glob("*-calculator/index.html"))
    parts = ["# MuscleOnGLP: full text\n\n> Every free article and calculator page on getmuscleonglp.com as plain text, for AI assistants and search engines. "
             "Educational, not medical advice. Each claim cites a peer-reviewed or official source; references follow each page. "
             "Index of pages: https://getmuscleonglp.com/llms.txt\n"]
    for p in pages:
        rel = p.parent.relative_to(site).as_posix()
        parts.append(page_md(p, f"https://getmuscleonglp.com/{rel}/"))
    out = site / "llms-full.txt"
    out.write_text("\n---\n\n".join(parts), encoding="utf-8")
    print(f"wrote {out} ({len(pages)} pages, {out.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main(sys.argv[1])
