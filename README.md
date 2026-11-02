# Carnelian Mutual Fund — Reception TV Microsite

A full-screen, zero-interaction **digital-signage page** for the office reception TV.
It shows Carnelian's marketing banners and the latest **fund-wise NAV** in a looping
carousel, with data pulled daily from [carnelianmf.com](https://carnelianmf.com).

Point the reception TV's browser at one URL — the page loops forever, refreshes its
data on its own, and reloads itself once a day. Nothing to touch.

---

## How it works

```
carnelianmf.com ──scrape──►  scraper/scrape.py  ──►  site/data/nav.json  +  site/assets/banners/*
                                                              │
                                   (GitHub Actions, once a day)│  publishes
                                                              ▼
                                               GitHub Pages  ──►  TV browser (LG webOS)
```

1. **`scraper/scrape.py`** fetches the NAV table from `carnelianmf.com/nav-idcw`
   (server-rendered HTML — no headless browser needed) and the homepage banner images,
   and writes everything to **`site/data/nav.json`**.
2. **`site/`** is a static page (`index.html` + `styles.css` + `app.js`). It reads
   `nav.json` and runs the carousel: banner slides → one slide per fund's NAV → repeat.
3. **GitHub Actions** (`.github/workflows/deploy.yml`) runs the scraper once a day and
   publishes `site/` to **GitHub Pages**. The TV just opens the Pages URL.

The carousel refreshes `nav.json` every 30 minutes and does a full page reload once a
day, so the display stays current without anyone touching the TV.

---

## One-time setup (≈ 2 minutes)

1. Push this repo to GitHub (branch `main`).
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Source = “GitHub Actions”.**
3. Go to the **Actions** tab → **“Scrape NAV & Deploy TV Microsite”** → **Run workflow**
   (this does the first scrape + deploy; after that it runs automatically every day).
4. When it finishes, the deploy step prints the public URL, e.g.
   `https://<your-org>.github.io/tv-microsite/`. **That is the TV URL.**

### Point the LG TV at it
- Open the TV's web browser and go to the Pages URL.
- Set it as the browser home page / bookmark so it reloads on power-on.
- The page is built for 1920×1080 landscape; use the browser's full-screen mode.

---

## Running it locally

```bash
pip install -r scraper/requirements.txt
python scraper/scrape.py          # refresh site/data/nav.json + banners
cd site && python -m http.server 8099
# open http://localhost:8099/
```

---

## Changing what's displayed

| Want to change… | Edit |
| --- | --- |
| Which banners show, and their headline/subtitle text | `BANNER_SOURCES` in `scraper/scrape.py` |
| Seconds per slide, rows per NAV page, refresh interval | `CONFIG` at the top of `site/app.js` |
| Colours, fonts, layout | `site/styles.css` |
| When the daily scrape runs | the `cron` line in `.github/workflows/deploy.yml` |

---

## Data & robustness notes

- **Current live data:** the **Carnelian Liquid Fund** (Direct/Regular × Growth/IDCW).
  The **Small Cap Fund** is in its NFO (no NAV yet); once it lists, its rows appear in
  the same NAV table and the scraper picks them up automatically — no code change needed.
- The scraper **aborts rather than overwrite** `nav.json` if it parses zero NAV rows, so
  a bad fetch never blanks the TV — it keeps showing the last good data.
- The page shows a small status dot (green = fresh, amber = data looks delayed,
  red = offline) next to the source label.
- If Carnelian ever moves the NAV table behind client-side JavaScript, switch the fetch
  in `scrape.py` to a headless browser (Playwright); the `nav.json` shape stays the same.

> NAV values are shown for information only and are scraped from the AMC's public site.
> Mutual fund investments are subject to market risks.
