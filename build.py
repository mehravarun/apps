#!/usr/bin/env python3
"""Build the static site in docs/ from src/<slug>.html + apps.json + site.json.

Each app gets:
  docs/<slug>/index.html  landing page: SEO text, the app embedded, links to other apps
  docs/<slug>/app.html    the app itself, untouched
  docs/<slug>/og.png      social preview image (skipped if no font available)
Plus docs/index.html, sitemap.xml, robots.txt, feed.xml, 404.html, .nojekyll, CNAME.

Usage: python3 build.py
"""
import html, json, re, shutil, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, OUT = ROOT / "src", ROOT / "docs"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REQUIRED = ["slug", "name", "tagline", "category", "description", "how_to", "keywords", "date"]
e = lambda s: html.escape(str(s), quote=True)


def load():
    site = json.loads((ROOT / "site.json").read_text())
    apps = json.loads((ROOT / "apps.json").read_text())
    errors, seen = [], set()
    for i, a in enumerate(apps):
        for k in REQUIRED:
            if not a.get(k):
                errors.append(f"app #{i} ({a.get('slug', '?')}): missing '{k}'")
        s = a.get("slug", "")
        if not SLUG_RE.match(s):
            errors.append(f"app #{i}: bad slug '{s}' (lowercase letters, digits, hyphens)")
        if s in seen:
            errors.append(f"duplicate slug '{s}'")
        seen.add(s)
        if not (SRC / f"{s}.html").is_file():
            errors.append(f"missing src/{s}.html")
        try:
            datetime.strptime(a.get("date", ""), "%Y-%m-%d")
        except ValueError:
            errors.append(f"{s}: date must be YYYY-MM-DD")
    if errors:
        sys.exit("Build failed:\n  " + "\n  ".join(errors))
    apps.sort(key=lambda a: (a["date"], a["slug"]), reverse=True)
    site["base_url"] = site["base_url"].rstrip("/")
    return site, apps


def accent(a):
    c = a.get("accent", "")
    return c if re.match(r"^#[0-9a-fA-F]{6}$", c) else "#3cf0a8"


CSS = """
:root{--bg:#0b0d10;--panel:#13161b;--line:#232832;--ink:#e8ecf1;--dim:#9aa3b0;--faint:#5d6672;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
body{min-height:100vh;line-height:1.6}
a{color:inherit}
.wrap{max-width:1100px;margin:0 auto;padding:0 max(18px,env(safe-area-inset-left)) 0 max(18px,env(safe-area-inset-right))}
.top{display:flex;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid var(--line)}
.logo{font:700 15px var(--mono);letter-spacing:.18em;text-decoration:none;text-transform:uppercase}
.logo span{color:var(--acc,#3cf0a8)}
.top nav a{color:var(--dim);text-decoration:none;font-size:14px;margin-left:18px}
.top nav a:hover{color:var(--ink)}
h1{font-size:clamp(30px,6vw,52px);line-height:1.08;letter-spacing:-.02em;margin:40px 0 12px}
h2{font-size:22px;margin:42px 0 12px;letter-spacing:-.01em}
.lede{font-size:clamp(16px,2.4vw,19px);color:var(--dim);max-width:720px}
.meta{font:13px var(--mono);color:var(--faint);margin-top:14px;display:flex;gap:14px;flex-wrap:wrap}
.chip{display:inline-block;font:600 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:99px;border:1px solid var(--line);color:var(--dim);background:var(--panel);cursor:pointer}
.chip.on{color:#06110c;background:var(--acc,#3cf0a8);border-color:transparent}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0 18px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:12px;font-weight:600;text-decoration:none;border:1px solid var(--line);background:var(--panel)}
.btn.main{background:var(--acc,#3cf0a8);color:#06110c;border-color:transparent}
.btn:hover{filter:brightness(1.1)}
.frame{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#000;height:min(78vh,820px);box-shadow:0 20px 60px rgba(0,0,0,.45)}
.frame iframe{width:100%;height:100%;border:0;display:block}
.prose{max-width:720px;color:#cfd5dd}
.prose p{margin:0 0 14px}
.prose ol{padding-left:22px}.prose li{margin:6px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:22px 0 10px}
.card{position:relative;display:block;padding:20px;border-radius:16px;border:1px solid var(--line);background:var(--panel);text-decoration:none;transition:.2s;overflow:hidden}
.card::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:var(--c)}
.card:hover{transform:translateY(-2px);border-color:var(--c)}
.card h3{font-size:19px;margin:8px 0 6px}
.card p{font-size:14px;color:var(--dim)}
.card .k{font:600 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--c)}
.card .d{font:12px var(--mono);color:var(--faint);margin-top:12px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:28px}
footer{margin:70px 0 0;padding:26px 0 max(30px,env(safe-area-inset-bottom));border-top:1px solid var(--line);color:var(--faint);font-size:13px}
.empty{color:var(--dim);margin:40px 0}
"""


def page(site, *, title, desc, path, body, acc="#3cf0a8", og_img=None, jsonld=None, extra_head=""):
    url = f"{site['base_url']}{path}"
    og = f'<meta property="og:image" content="{e(og_img)}">\n<meta name="twitter:card" content="summary_large_image">' if og_img else '<meta name="twitter:card" content="summary">'
    ld = ""
    if jsonld:
        ld = '<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(site['name'])}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
{og}
<meta name="theme-color" content="#0b0d10">
<link rel="alternate" type="application/rss+xml" title="{e(site['name'])}" href="{e(site['base_url'])}/feed.xml">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b0d10'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%233cf0a8' stroke-width='3'/%3E%3C/svg%3E">
<style>{CSS}</style>
{ld}{extra_head}
</head>
<body style="--acc:{acc}">
<div class="wrap">
<header class="top"><a class="logo" href="{e(site['base_url'])}/">{e(site['name'])}<span>.</span></a><nav><a href="{e(site['base_url'])}/">All apps</a><a href="{e(site['base_url'])}/feed.xml">RSS</a></nav></header>
{body}
<footer>{e(site['name'])} · {e(site['tagline'])} All apps are free, run entirely in your browser and send no data anywhere.</footer>
</div>
</body>
</html>
"""


def card(site, a):
    return (f'<a class="card" style="--c:{accent(a)}" href="{e(site["base_url"])}/{e(a["slug"])}/" data-cat="{e(a["category"])}">'
            f'<div class="k">{e(a["category"])}</div><h3>{e(a["name"])}</h3><p>{e(a["tagline"])}</p>'
            f'<div class="d">{e(a["date"])}</div></a>')


def app_page(site, a, apps):
    base, slug = site["base_url"], a["slug"]
    title = f"{a['name']} — {a['tagline']}"
    desc = a.get("meta_description") or a["tagline"]
    paras = "".join(f"<p>{e(p)}</p>" for p in re.split(r"\n\s*\n", a["description"].strip()))
    steps = "".join(f"<li>{e(s)}</li>" for s in a["how_to"])
    others = [o for o in apps if o["slug"] != slug]
    same = [o for o in others if o["category"] == a["category"]]
    more = (same + [o for o in others if o not in same])[:6]
    more_html = f'<h2>More apps</h2><div class="grid">{"".join(card(site, o) for o in more)}</div>' if more else ""
    has_og = (OUT / slug / "og.png").exists()
    jsonld = {
        "@context": "https://schema.org", "@type": "WebApplication", "name": a["name"],
        "description": desc, "url": f"{base}/{slug}/", "applicationCategory": a["category"],
        "operatingSystem": "Any (web browser)", "browserRequirements": "Requires JavaScript",
        "datePublished": a["date"], "keywords": ", ".join(a["keywords"]), "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "author": {"@type": "Person", "name": site.get("author", "")},
    }
    body = f"""
<main>
<h1>{e(a['name'])}</h1>
<p class="lede">{e(a['tagline'])}</p>
<div class="meta"><span class="chip">{e(a['category'])}</span><span>Published {e(a['date'])}</span><span>Free · No sign-up · Works offline once loaded</span></div>
<div class="btns"><a class="btn main" href="app.html">Open full screen ↗</a><a class="btn" href="{e(base)}/">Browse all apps</a></div>
<div class="frame"><iframe src="app.html" title="{e(a['name'])}" loading="lazy" allow="fullscreen; clipboard-write; autoplay"></iframe></div>
<h2>About {e(a['name'])}</h2>
<div class="prose">{paras}</div>
<h2>How to use it</h2>
<div class="prose"><ol>{steps}</ol></div>
{more_html}
</main>"""
    return page(site, title=title, desc=desc, path=f"/{slug}/", body=body, acc=accent(a),
                og_img=f"{base}/{slug}/og.png" if has_og else None, jsonld=jsonld)


def home_page(site, apps):
    cats = sorted({a["category"] for a in apps})
    chips = "".join(f'<button class="chip" data-f="{e(c)}">{e(c)}</button>' for c in cats)
    grid = "".join(card(site, a) for a in apps) or '<p class="empty">The first app lands soon.</p>'
    filt = f'<div class="filters"><button class="chip on" data-f="">All · {len(apps)}</button>{chips}</div>' if len(cats) > 1 else ""
    script = """<script>
document.querySelectorAll('.filters .chip').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.filters .chip').forEach(x=>x.classList.toggle('on',x===b));
 document.querySelectorAll('.grid .card').forEach(c=>c.style.display=!b.dataset.f||c.dataset.cat===b.dataset.f?'':'none');});
</script>"""
    body = f"""
<main>
<h1>{e(site['name'])}</h1>
<p class="lede">{e(site['tagline'])}</p>
{filt}
<div class="grid">{grid}</div>
</main>{script}"""
    jsonld = {"@context": "https://schema.org", "@type": "ItemList",
              "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{site['base_url']}/{a['slug']}/", "name": a["name"]}
                                  for i, a in enumerate(apps)]}
    return page(site, title=f"{site['name']} — free browser apps, tools and games", desc=site["tagline"], path="/",
                body=body, og_img=None, jsonld=jsonld)


def og_image(a, site, dest):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    fonts = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    if not all(Path(f).exists() for f in fonts):
        return
    W, H = 1200, 630
    acc = tuple(int(accent(a)[i:i + 2], 16) for i in (1, 3, 5))
    img = Image.new("RGB", (W, H), (11, 13, 16))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=(18, 21, 26))
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=(18, 21, 26))
    d.rectangle([0, 0, W, 10], fill=acc)
    bold, reg = ImageFont.truetype(fonts[0], 92), ImageFont.truetype(fonts[1], 38)
    small = ImageFont.truetype(fonts[0], 26)
    d.text((80, 90), a["category"].upper(), font=small, fill=acc)
    name = a["name"]
    while d.textlength(name, font=bold) > W - 160 and bold.size > 40:
        bold = ImageFont.truetype(fonts[0], bold.size - 6)
    d.text((80, 140), name, font=bold, fill=(232, 236, 241))
    words, lines, cur = a["tagline"].split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=reg) > W - 160:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    y = 140 + bold.size + 40
    for ln in lines[:4]:
        d.text((80, y), ln, font=reg, fill=(154, 163, 176)); y += 52
    d.text((80, H - 80), f"{site['name']} · free, runs in your browser", font=small, fill=(93, 102, 114))
    img.save(dest, optimize=True)


def main():
    site, apps = load()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    base = site["base_url"]
    for a in apps:
        d = OUT / a["slug"]
        d.mkdir()
        shutil.copyfile(SRC / f"{a['slug']}.html", d / "app.html")
        og_image(a, site, d / "og.png")
    for a in apps:
        (OUT / a["slug"] / "index.html").write_text(app_page(site, a, apps))
    (OUT / "index.html").write_text(home_page(site, apps))
    (OUT / "404.html").write_text(page(site, title=f"Not found — {site['name']}", desc="Page not found", path="/404.html",
                                       body=f'<main><h1>Not found</h1><p class="lede">That page doesn\'t exist. <a href="{e(base)}/">Browse all apps →</a></p></main>'))
    (OUT / ".nojekyll").write_text("")
    if site.get("custom_domain"):
        (OUT / "CNAME").write_text(site["custom_domain"].strip() + "\n")
    newest = apps[0]["date"] if apps else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = [(f"{base}/", newest)] + [(f"{base}/{a['slug']}/", a["date"]) for a in apps]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                     + "".join(f"  <url><loc>{e(u)}</loc><lastmod>{d}</lastmod></url>\n" for u, d in urls) + "</urlset>\n")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")
    rfc = lambda d: datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc).strftime("%a, %d %b %Y 00:00:00 +0000")
    items = "".join(f"<item><title>{e(a['name'])} — {e(a['tagline'])}</title><link>{e(base)}/{e(a['slug'])}/</link>"
                    f"<guid>{e(base)}/{e(a['slug'])}/</guid><pubDate>{rfc(a['date'])}</pubDate><description>{e(a['tagline'])}</description></item>\n"
                    for a in apps[:50])
    (OUT / "feed.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>{e(site["name"])}</title>'
                                  f'<link>{e(base)}/</link><description>{e(site["tagline"])}</description>\n{items}</channel></rss>\n')
    print(f"Built {len(apps)} app(s) into docs/ for {base}")


if __name__ == "__main__":
    main()
