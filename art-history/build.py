#!/usr/bin/env python3
"""Build the Weekly Art History pages from works.json.

Run from this directory:  python3 build.py

works.json is the record. This script regenerates index.html and the six
room pages from it. Never hand-edit a generated page -- edit works.json
and run this again. room.css and cite.js are NOT generated; leave them alone.
"""
import json, sys, datetime, html, os

SITE = "https://printermanart.club"
DISCORD = "https://discord.gg/nn3xjcS745"
OG = SITE + "/img/og-art-history.jpg"

# The six rooms, in page order. Each card image MUST be a work that appears
# in that room -- the build fails if it is not. A visitor who clicks a card
# expecting to see that picture has to find it inside.
ROOMS = [
    {"slug": "faith",       "name": "Church / Faith Art",
     "short": "Church / Faith",
     "card": "https://openaccess-cdn.clevelandart.org/1976.2/1976.2_web.jpg",
     "pos": "pos-upper",
     "card_alt": "Detail of Caravaggio's Crucifixion of Saint Andrew: an executioner on a ladder reaching up toward the ropes."},
    {"slug": "fantasy",     "name": "Fantasy Art", "short": "Fantasy",
     "card": "https://images.metmuseum.org/CRDImages/ep/web-large/DP-14201-003.jpg",
     "pos": "",
     "card_alt": "Detail of Böcklin's Island of the Dead: a walled rocky island with black cypresses rising at its center."},
    {"slug": "classics",    "name": "Classics", "short": "Classics",
     "card": "https://images.metmuseum.org/CRDImages/ep/web-large/DP119115.jpg",
     "pos": "",
     "card_alt": "Detail of Bruegel's The Harvesters: a golden wheat field with peasants cutting a path through the standing corn."},
    {"slug": "non-western", "name": "Non-Western Art", "short": "Non-Western",
     "card": "https://images.metmuseum.org/CRDImages/as/web-large/DP146823.jpg",
     "pos": "",
     "card_alt": "Detail of Kuniyoshi's triptych: a ship crowded with warriors riding a towering blue wave, the ghosts of the drowned Taira rising around it."},
    {"slug": "landscape",   "name": "Landscape + Nature", "short": "Landscape",
     "card": "https://openaccess-cdn.clevelandart.org/1965.233/1965.233_web.jpg",
     "pos": "pos-sky",
     "card_alt": "Detail of Church's Twilight in the Wilderness: a sunset sky burning orange and crimson above dark hills."},
    {"slug": "figures",     "name": "Female Figures", "short": "Female Figures",
     "card": "https://images.metmuseum.org/CRDImages/ad/web-large/DP-29006-001.jpg",
     "pos": "pos-high",
     "card_alt": "Detail of Sargent's Madame X: a woman in a black gown with jeweled straps against a dark brown ground."},
]
BY_SLUG = {r["slug"]: r for r in ROOMS}

e = lambda s: html.escape(str(s or ""), quote=True)

ANALYTICS = """
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "0b3e30f708cd4777957b92defbbdd859"}'></script><!-- End Cloudflare Web Analytics -->

<!-- GoatCounter --><script data-goatcounter="https://crablord9001.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script><!-- End GoatCounter -->
"""


def head(title, desc, canonical, og_alt):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<link rel="canonical" href="{e(canonical)}">
<meta name="theme-color" content="#F1EDE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16130F" media="(prefers-color-scheme: dark)">

<link rel="icon" href="/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/img/favicon-180.png">

<meta property="og:type" content="website">
<meta property="og:site_name" content="PrinterMan's Art Club">
<meta property="og:title" content="{e(title)}">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="{OG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(og_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:description" content="{e(desc)}">
<meta name="description" content="{e(desc)}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/art-history/room.css">
</head>
<body>

<div class="col">

  <nav class="site-strip">
    <a class="site-home" href="/">PrinterMan&rsquo;s Art Club</a>
    <a href="/news.html">News Briefing</a>
    <a class="site-join" href="{DISCORD}">Join</a>
  </nav>
"""


FOOT = """
  <p class="site-foot"><a href="/">printermanart.club</a> &nbsp;&middot;&nbsp; <a href="/about.html">About</a> &nbsp;&middot;&nbsp; <a href="/faq.html">FAQ</a> &nbsp;&middot;&nbsp; &copy; 2026 PrinterMan</p>

</div>
"""


def cards(current=None, foot=False):
    cls = "rooms-foot" if foot else "rooms"
    out = [f'\n  <section class="{cls}">']
    if foot:
        out.append('    <p class="rooms-label">The other rooms</p>')
    out.append('    <div class="room-grid">\n')
    for r in ROOMS:
        if foot and r["slug"] == current:
            continue
        cur = ' aria-current="page"' if r["slug"] == current and not foot else ""
        pos = (" " + r["pos"]) if r["pos"] else ""
        out.append(f"""      <a class="room" href="/art-history/{r['slug']}.html"{cur}>
        <img class="room-img{pos}" src="{e(r['card'])}" loading="lazy" decoding="async"
             alt="{e(r['card_alt'])}">
        <div class="room-cap"><p class="room-name">{e(r['name'])}</p></div>
      </a>
""")
    out.append("    </div>\n  </section>\n")
    return "".join(out)


def week_range(d):
    a = datetime.date.fromisoformat(d)
    b = a + datetime.timedelta(days=6)
    if a.month == b.month:
        return f"{a.day}&ndash;{b.day} {a:%B} {a.year}"
    return f"{a.day} {a:%B} &ndash; {b.day} {b:%B} {b.year}"


def plate(w):
    if w["rights"] == "in-copyright":
        art = f"""      <div class="offsite">
        <p>Living artist &mdash; shown by credit rather than plate. <a href="{e(w['object_url'])}" target="_blank" rel="noopener">See the work on the artist&rsquo;s own site &rarr;</a></p>
      </div>"""
    else:
        art = f"""      <div class="frame">
        <img src="{e(w['image'])}" width="{w['image_w']}" height="{w['image_h']}" loading="lazy" decoding="async"
             alt="{e(w['alt'])}">
      </div>"""
    bits = [b for b in [e(w["artist_bio"]), e(w["date"]), e(w["medium"])] if b]
    line1 = " &middot; ".join(bits)
    acc = f", {e(w['accession'])}" if w["accession"] else ""
    line2 = (f"{e(w['institution'])}{acc} &middot; {e(w['rights_note'])} &middot; "
             f"<a href=\"{e(w['object_url'])}\" target=\"_blank\" rel=\"noopener\">{e(w['object_host'])}</a>")
    shown = datetime.date.fromisoformat(w["shown"])
    return f"""
    <article class="work" id="{e(w['id'])}">
{art}
      <div class="plaque">
        <h2 class="work-title">{e(w['title'])}</h2>
        <span class="sep" aria-hidden="true">|</span>
        <span class="by">{e(w['artist'])}</span>
        <details class="cite">
          <summary title="Catalogue details"><span aria-hidden="true">i</span><span class="sr">Catalogue details</span></summary>
          <div class="cite-panel"><p class="tombstone">{line1}<br>{line2}</p></div>
        </details>
      </div>
      <p class="label">{e(w['label'])}</p>
      <p class="shown">Shown {shown:%-d %B %Y}</p>
    </article>
"""


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, "works.json"), encoding="utf-8"))
    works = data["works"]

    # --- validation ---
    ids = [w["id"] for w in works]
    if len(ids) != len(set(ids)):
        sys.exit("FAIL: duplicate work ids")
    for w in works:
        if w["room"] not in BY_SLUG:
            sys.exit(f"FAIL: unknown room {w['room']!r} on {w['id']}")
        datetime.date.fromisoformat(w["shown"])
    for r in ROOMS:
        imgs = [w["image"] for w in works if w["room"] == r["slug"]]
        if r["card"] not in imgs:
            sys.exit(f"FAIL: the {r['name']} card image is not a work in that room. "
                     "Every card must show a picture the visitor will find inside.")

    latest = max(w["shown"] for w in works)
    this_week = [w for w in works if w["shown"] == latest]

    # --- the lander ---
    rows = []
    for w in this_week:
        note = ('\n            <span class="w-note">&nbsp;&mdash; living artist, shown by credit</span>'
                if w["rights"] == "in-copyright" else "")
        rows.append(f"""        <li class="week-row">
          <span class="week-main">
            <a href="/art-history/{w['room']}.html#{e(w['id'])}">
              <span class="w-title">{e(w['title'])}</span>
              <span class="w-sep" aria-hidden="true">|</span>
              <span class="w-by">{e(w['artist'])}</span>
            </a>{note}
          </span>
          <span class="w-room">{e(BY_SLUG[w['room']]['short'])}</span>
        </li>
""")
    lander = head("Weekly Art History — PrinterMan's Art Club",
                  "Six rooms of art history, updated every Sunday morning.",
                  SITE + "/art-history/",
                  "The words Weekly Art History set on a plain plaster-colored gallery wall.")
    lander += """
  <header class="page">
    <h1>Weekly Art History</h1>
    <p class="range">Six rooms</p>
  </header>
"""
    lander += cards()
    lander += f"""
  <section class="week">
    <details class="week-fold">
      <summary>
        <span class="fold-text">
          <svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          This Week &middot; {week_range(latest)}
        </span>
      </summary>

      <ul class="week-list">
{''.join(rows)}      </ul>
    </details>

    <p class="cadence">Rooms update Sunday mornings.</p>
  </section>
"""
    lander += FOOT + "\n" + ANALYTICS + "\n</body>\n</html>\n"
    open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(lander)

    # --- the six rooms ---
    for r in ROOMS:
        mine = sorted([w for w in works if w["room"] == r["slug"]],
                      key=lambda w: (w["shown"], w["id"]), reverse=True)
        n = len(mine)
        p = head(f"{r['name']} — Weekly Art History",
                 f"Every work shown in the {r['name']} room of PrinterMan's Art Club.",
                 f"{SITE}/art-history/{r['slug']}.html",
                 "The words Weekly Art History set on a plain plaster-colored gallery wall.")
        p += f"""
  <header class="page">
    <a class="back" href="/art-history/">&larr; Weekly Art History</a>
    <h1>{e(r['name'])}</h1>
    <p class="range">{n} work{'' if n == 1 else 's'}</p>
  </header>
"""
        p += ("".join(plate(w) for w in mine) if mine
              else '\n  <p class="empty">Nothing hung in this room yet.</p>\n')
        p += cards(current=r["slug"], foot=True)
        p += FOOT + '\n<script src="/art-history/cite.js"></script>\n' + ANALYTICS + "\n</body>\n</html>\n"
        open(os.path.join(here, r["slug"] + ".html"), "w", encoding="utf-8").write(p)

    print(f"built index.html + {len(ROOMS)} rooms from {len(works)} works; "
          f"this week = {len(this_week)} ({latest})")


if __name__ == "__main__":
    main()
