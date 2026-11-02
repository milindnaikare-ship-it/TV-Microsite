#!/usr/bin/env python3
"""
Scrape NAV + banner data from https://carnelianmf.com for the reception-TV microsite.

Output:
  site/data/nav.json          structured NAV + banner data consumed by the TV page
  site/assets/banners/*.jpg   downloaded banner images (self-contained, no hotlinking)
  site/assets/carnelian-logo.svg   brand logo

The NAV page is server-rendered, so a plain HTTP request is enough. If Carnelian
later moves the NAV table behind client-side JS, switch SOURCE parsing to a
headless browser (Playwright) -- the JSON schema below should stay the same.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://carnelianmf.com"
NAV_URL = f"{BASE}/nav-idcw"
HOME_URL = f"{BASE}/"

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA_FILE = SITE / "data" / "nav.json"
BANNER_DIR = SITE / "assets" / "banners"
ASSET_DIR = SITE / "assets"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 CarnelianTVMicrosite/1.0"
    )
}
TIMEOUT = 30

# Banner slides for the TV carousel, in display order. The images are the key
# marketing backgrounds from the homepage; the text is the site's own approved
# copy, overlaid on the left where the website places it. `theme` controls text
# colour: "dark" = light text over a dark image, "light" = dark text over cream.
# Edit this list to change what the reception TV promotes.
BANNER_SOURCES = [
    {
        "src": "/_files/media/01a0c7ec-70f3-7059-a143-544f8e604e61/small-cap-slide-desktop.jpg",
        "theme": "dark",
        "kicker": "New Fund Offer",
        "title": "Carnelian Small Cap Fund",
        "subtitle": "An open-ended equity scheme predominantly investing in small cap stocks.",
    },
    {
        "src": "/_files/media/01a0c7ec-70f3-7059-a143-544f8e604e61/hero-bg.jpeg",
        "theme": "dark",
        "kicker": "Carnelian Mutual Fund",
        "title": "Your aspirations deserve a thoughtful partner.",
        "subtitle": "Whatever stage of life you're at — beginning, building or arriving — we walk with you.",
    },
    {
        "src": "/_files/media/01a0c7ec-70f3-7059-a143-544f8e604e61/liquid-fund-notice.png",
        "theme": "light",
        "kicker": "Our Philosophy",
        "title": "QGARP — Quality Growth, at a Reasonable Price",
        "subtitle": "Quality businesses that can keep growing, bought at a price that makes sense.",
    },
]


def fetch(url: str) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def split_fund_name(full: str) -> tuple[str, str, str]:
    """'Carnelian Liquid Fund - Direct Plan - Growth' -> (fund, plan, option)."""
    parts = [clean(p) for p in full.split(" - ")]
    fund = parts[0] if parts else full
    plan = parts[1] if len(parts) > 1 else ""
    option = " - ".join(parts[2:]) if len(parts) > 2 else ""
    return fund, plan, option


def parse_nav(html: str) -> tuple[list[dict], str]:
    soup = BeautifulSoup(html, "html.parser")
    funds: list[dict] = []
    nav_date_global = ""

    for table in soup.find_all("table"):
        header_cells = [clean(th.get_text()) for th in table.find_all("th")]
        header_blob = " ".join(header_cells).lower()
        if "fund name" not in header_blob or "nav" not in header_blob:
            continue  # not the NAV table

        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if not cells or cells[0].name == "th":
                continue
            values = [clean(c.get_text()) for c in cells]
            if len(values) < 3:
                continue
            full_name, nav_date, nav_value = values[0], values[1], values[2]
            if not full_name or not re.search(r"\d", nav_value):
                continue
            fund, plan, option = split_fund_name(full_name)
            nav_date_global = nav_date_global or nav_date
            funds.append(
                {
                    "name": full_name,
                    "fund": fund,
                    "plan": plan,
                    "option": option,
                    "nav_date": nav_date,
                    "nav": nav_value,
                }
            )

    return funds, nav_date_global


def download(url: str, dest: pathlib.Path) -> bool:
    try:
        resp = fetch(url)
    except Exception as exc:  # noqa: BLE001 - keep previous asset on failure
        print(f"  ! could not download {url}: {exc}", file=sys.stderr)
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(resp.content)
    print(f"  downloaded {dest.relative_to(SITE)} ({len(resp.content)//1024} KB)")
    return True


def collect_banners() -> list[dict]:
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
    banners: list[dict] = []
    for spec in BANNER_SOURCES:
        src = spec["src"]
        url = urljoin(BASE, src)
        fname = pathlib.Path(src).name.replace("%20", "_")
        dest = BANNER_DIR / fname
        if download(url, dest):
            banners.append(
                {
                    "img": f"assets/banners/{fname}",
                    "theme": spec.get("theme", "dark"),
                    "kicker": spec.get("kicker", ""),
                    "title": spec.get("title", ""),
                    "subtitle": spec.get("subtitle", ""),
                }
            )
    return banners


def main() -> int:
    print(f"Scraping NAV from {NAV_URL}")
    nav_html = fetch(NAV_URL).text
    funds, nav_date = parse_nav(nav_html)
    print(f"  parsed {len(funds)} NAV rows (as of {nav_date or 'unknown'})")
    if not funds:
        print("ERROR: no NAV rows parsed -- aborting so stale data is kept.", file=sys.stderr)
        return 1

    print("Downloading banners")
    banners = collect_banners()

    payload = {
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": NAV_URL,
        "nav_date": nav_date,
        "funds": funds,
        "banners": banners,
    }
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {DATA_FILE.relative_to(ROOT)}: {len(funds)} funds, {len(banners)} banners")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
