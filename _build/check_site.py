"""Pre-merge checks for the static site. Run from the repo root: python3 _build/check_site.py

Errors (exit 1):
  - internal links to pages or files that do not exist, and #fragments with no matching id
  - <img> sources that do not exist
  - JSON-LD blocks that do not parse
  - FAQPage schema whose questions or answers differ from the visible <details> FAQ
    (citation superscripts and tags are ignored; the visible text is the source)
  - in-text citations that point at a missing reference, or references nobody cites
Warnings (exit 0):
  - <title> over 65 characters or meta description outside 70-160, on indexable pages
  - references not numbered in the order they are first cited
"""
import glob, html, json, os, re, sys
from pathlib import Path

SKIP = ("node_modules",)


def norm(t):
    t = re.sub(r"\s+", " ", html.unescape(t))
    return t.replace("“", '"').replace("”", '"').replace("'", '"').replace("’", '"').strip()


def plain(a):
    a = re.sub(r"<sup>.*?</sup>", "", a, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", a))).strip()


def main():
    files = [f for f in glob.glob("**/*.html", recursive=True) if not any(s in f for s in SKIP)]
    pages = {f: open(f, encoding="utf-8").read() for f in files}
    ids = {f: set(re.findall(r'id="([^"]+)"', s)) for f, s in pages.items()}
    errors, warnings = [], []

    for f, s in sorted(pages.items()):
        # Internal links and fragments.
        for path, frag in re.findall(r'href="(/[^"#?]*)(#[^"]*)?"', s):
            t = path.lstrip("/")
            hit = next((c for c in ([t, os.path.join(t, "index.html")] if t else ["index.html"]) if os.path.isfile(c)), None)
            if not hit:
                errors.append(f"{f}: link to missing {path}")
            elif frag and len(frag) > 1 and hit.endswith(".html") and frag[1:] not in ids.get(hit, set()):
                errors.append(f"{f}: link to missing anchor {path}{frag}")
        for frag in re.findall(r'href="#([^"]+)"', s):
            if frag not in ids[f] and frag != "main":
                errors.append(f"{f}: missing in-page anchor #{frag}")
        for src in re.findall(r'<img\b[^>]*\bsrc="(/[^"?#]+)"', s):
            if not os.path.isfile(src.lstrip("/")):
                errors.append(f"{f}: image missing {src}")

        # JSON-LD, and FAQPage against the visible FAQ.
        visible = {norm(re.sub("<[^>]+>", "", q)): plain(a) for q, a in
                   re.findall(r"<details[^>]*>\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>\s*</details>", s, re.S)}
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            try:
                d = json.loads(block)
            except ValueError as e:
                errors.append(f"{f}: JSON-LD does not parse ({e})")
                continue
            if isinstance(d, dict) and d.get("@type") == "FAQPage":
                for x in d["mainEntity"]:
                    v = visible.get(norm(x["name"]))
                    if v is None:
                        errors.append(f"{f}: FAQ schema question not on the page: {x['name'][:60]}")
                    elif v != x["acceptedAnswer"]["text"]:
                        errors.append(f"{f}: FAQ schema answer differs from the page: {x['name'][:60]}")

        # References: every cited number exists, every reference is cited, in order.
        if '<div class="references"' in s:
            ri = s.index('<div class="references"')
            listed = [int(n) for n in re.findall(r'<li id="ref-(\d+)"', s[ri:])]
            cited = []
            for n in re.findall(r'href="#ref-(\d+)"', s[:ri]):
                if int(n) not in cited:
                    cited.append(int(n))
            for n in cited:
                if n not in listed:
                    errors.append(f"{f}: cites ref-{n}, which is not in the list")
            for n in listed:
                if n not in cited:
                    errors.append(f"{f}: ref-{n} is never cited")
            if cited and cited != sorted(cited):
                warnings.append(f"{f}: references not in citation order {cited}")

        # Title and description lengths on indexable pages.
        if not re.search(r'<meta name="robots" content="noindex', s) and f.endswith("index.html"):
            t = re.search(r"<title>([^<]*)</title>", s)
            d = re.search(r'<meta name="description" content="([^"]*)"', s)
            tl = len(html.unescape(t.group(1))) if t else 0
            dl = len(html.unescape(d.group(1))) if d else 0
            if tl > 65:
                warnings.append(f"{f}: title {tl} characters")
            if d and not 70 <= dl <= 160:
                warnings.append(f"{f}: description {dl} characters")

    # Every sitemap URL must be a page that exists (a dated roundup URL once
    # pointed at a file that was never written and served 404).
    sm = Path("sitemap.xml")
    if sm.exists():
        for loc in re.findall(r"<loc>https://getmuscleonglp\.com/([^<]*)</loc>", sm.read_text(encoding="utf-8")):
            target = Path(loc) / "index.html" if loc.endswith("/") or loc == "" else Path(loc)
            if not target.exists():
                errors.append(f"sitemap.xml lists /{loc}, which has no file")

    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{len(pages)} pages, {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
