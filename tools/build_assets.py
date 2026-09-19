#!/usr/bin/env python3
"""Moves the big inline <style> and the big inline app <script> out of index.html into
content-hashed files under /assets, so browsers can cache them and index.html stays small.

Usage: python3 tools/build_assets.py <input index.html> <output dir>
Writes <output dir>/index.html and <output dir>/assets/app.<hash>.css|js
Behavior is identical: the script keeps its exact position and order in the page.
"""
import hashlib, os, re, sys

src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()
os.makedirs(os.path.join(out, "assets"), exist_ok=True)

def digest(s): return hashlib.sha256(s.encode("utf-8")).hexdigest()[:10]

# 1) largest <style> block
styles = [(m.start(), m.end(), m.group(1)) for m in re.finditer(r"<style[^>]*>(.*?)</style>", html, re.S)]
s0, s1, css = max(styles, key=lambda x: len(x[2]))
if len(css) > 50000:
    name = "assets/app.%s.css" % digest(css)
    open(os.path.join(out, name), "w", encoding="utf-8").write(css)
    html = html[:s0] + '<link rel="stylesheet" href="/%s">' % name + html[s1:]

# 2) largest inline classic <script> block (skip JSON-LD and external scripts)
scripts = [(m.start(), m.end(), m.group(1)) for m in re.finditer(r"<script(?![^>]*\bsrc=)(?![^>]*type=\"application/ld\+json\")[^>]*>(.*?)</script>", html, re.S)]
j0, j1, js = max(scripts, key=lambda x: len(x[2]))
if len(js) > 50000 and "</script" not in js.lower():
    name = "assets/app.%s.js" % digest(js)
    open(os.path.join(out, name), "w", encoding="utf-8").write(js)
    html = html[:j0] + '<script src="/%s"></script>' % name + html[j1:]

open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
print("index.html: %d bytes (was %d)" % (len(html.encode("utf-8")), len(open(src, "rb").read())))
