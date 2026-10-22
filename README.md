# printermanart.club

Landing page and community front door for Printerman's Art Club.

> [ ONE-LINE DESCRIPTION GOES HERE — replace this with your own wording ]

**Live:** https://printermanart.club
**Discord:** https://discord.gg/nn3xjcS745

---

## Hosting

Static site served by GitHub Pages from the `main` branch, root directory.

- Repo: `CrabLord6001/printermanart.club`
- Custom domain is configured in **Settings → Pages**, which commits a `CNAME`
  file automatically. Don't create or edit that file by hand.
- **Enforce HTTPS** should be checked once the DNS check passes.

### DNS (Namecheap → Advanced DNS)

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | crablord6001.github.io. |

Namecheap's default **URL Redirect Record** on `@` must be deleted — it
conflicts with the A records. The locked SPF TXT record on `@` belongs to
Email Forwarding and can stay.

Propagation can take up to 24 hours.

---

## Local preview

No build step. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

Then visit http://localhost:8000

---

## Brand tokens

Carried over from the Discord promotional banner. Defined as CSS custom
properties on `:root` in `index.html`.

| Token | Value | Use |
|---|---|---|
| `--blurple` | `#5865F2` | Primary action / buttons |
| `--blurple-text` | `#99A2F7` | Blurple text on dark (`#5865F2` fails contrast) |
| `--ground` | `#101218` | Page background |
| `--panel` | `#171A22` | Cards and panels |
| `--border` | `#272B36` | Panel borders |
| `--text-muted` | `#9BA0AE` | Body text |
| `--text-dim` | `#7A8094` | Captions |
| `--gold` | `#D4A24C` | Accent, used sparingly |

Typeface: Poppins (300 / 400 / 500 / 600 / 700), loaded from Google Fonts.

**Attribution convention:** artwork title in bold white, artist name in
blurple. Credit is not optional — every piece shown links out to its artist.

---

## Status

Placeholder index only. The full lander (hero, spotlight gallery, meme of the
week, member showcase) is still in design and not yet ported here.
