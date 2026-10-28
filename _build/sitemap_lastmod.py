"""Set each sitemap <lastmod> to the date its page file last changed in git.

A lastmod that equals the build date on every URL teaches Google to ignore it;
the page's own last commit date is a signal it can use. Also drops
<changefreq> and <priority>, which Google ignores.
Usage (from the repo root, after committing page changes): python3 _build/sitemap_lastmod.py
"""
import re, subprocess
from pathlib import Path

SITE = "https://getmuscleonglp.com/"

def page_file(loc):
    rel = loc[len(SITE):]
    return Path(rel) / "index.html" if rel.endswith("/") or rel == "" else Path(rel)

def last_commit_date(path):
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return out or None

def main():
    sm = Path("sitemap.xml")
    s = sm.read_text(encoding="utf-8")
    s = re.sub(r"\s*<changefreq>[^<]*</changefreq>", "", s)
    s = re.sub(r"\s*<priority>[^<]*</priority>", "", s)
    def fix(m):
        block, loc = m.group(0), m.group(1)
        d = last_commit_date(page_file(loc))
        if not d:
            return re.sub(r"\s*<lastmod>[^<]*</lastmod>", "", block)
        if "<lastmod>" in block:
            return re.sub(r"<lastmod>[^<]*</lastmod>", f"<lastmod>{d}</lastmod>", block)
        return block.replace("</loc>", f"</loc>\n    <lastmod>{d}</lastmod>")
    s = re.sub(r"<url>\s*<loc>([^<]+)</loc>.*?</url>", fix, s, flags=re.S)
    sm.write_text(s, encoding="utf-8")
    dates = re.findall(r"<lastmod>([^<]+)</lastmod>", s)
    print(f"{len(dates)} URLs, {len(set(dates))} distinct lastmod dates")

if __name__ == "__main__":
    main()
