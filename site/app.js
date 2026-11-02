/* Carnelian Mutual Fund — reception TV carousel
 *
 * Loads site/data/nav.json (produced daily by the scraper) and runs a looping,
 * zero-interaction carousel: banner slides, then one slide per fund with its
 * NAV rows, then repeats. Refreshes data in the background and reloads the page
 * once a day so the TV never needs to be touched.
 */
(function () {
  "use strict";

  var CONFIG = {
    dataUrl: "data/nav.json",
    bannerMs: 10000, // time each banner slide is shown
    navMs: 14000, // time each NAV slide is shown
    rowsPerSlide: 6, // NAV rows per page (fits 1080p comfortably)
    dataRefreshMs: 30 * 60 * 1000, // re-fetch nav.json every 30 min
    dailyReloadMs: 24 * 60 * 60 * 1000, // hard page reload once a day
    staleHours: 36 // flag data older than this
  };

  var stage = document.getElementById("stage");
  var dotsEl = document.getElementById("dots");
  var liveDot = document.getElementById("liveDot");
  var sourceText = document.getElementById("sourceText");

  var slides = []; // [{type, build()}]
  var slideEls = [];
  var current = 0;
  var timer = null;

  // ---------- helpers ----------
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function formatNav(value) {
    // value is a string like "1,003.0242"
    return '<span class="rupee">₹</span>' + value;
  }

  function updateClock() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var el = document.getElementById("clock");
    if (el) el.textContent = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  // ---------- slide builders ----------
  function bannerSlide(banner, version) {
    return {
      type: "banner",
      title: "Carnelian Mutual Fund",
      ms: CONFIG.bannerMs,
      build: function () {
        var s = el("section", "slide banner");
        var frame = el("div", "banner-frame theme-" + (banner.theme || "dark"));
        var img = el("img");
        img.src = banner.img + (version ? "?v=" + encodeURIComponent(version) : "");
        img.alt = banner.title || "Carnelian";
        img.onerror = function () {
          frame.classList.add("noimg");
        };
        frame.appendChild(img);

        if (banner.kicker || banner.title || banner.subtitle) {
          var overlay = el("div", "banner-overlay");
          if (banner.kicker) overlay.appendChild(el("div", "banner-kicker", banner.kicker));
          if (banner.title) overlay.appendChild(el("div", "banner-title", banner.title));
          if (banner.subtitle) overlay.appendChild(el("div", "banner-subtitle", banner.subtitle));
          frame.appendChild(overlay);
        }
        s.appendChild(frame);
        return s;
      }
    };
  }

  function navSlide(fundName, rows, pageNo, pageCount, asOf) {
    return {
      type: "nav",
      title: "Net Asset Value",
      ms: CONFIG.navMs,
      build: function () {
        var s = el("section", "slide nav-slide");

        var head = el("div", "nav-head");
        var pageTag = pageCount > 1 ? ' <span style="font-size:24px;color:var(--cream-dim)">(' + pageNo + "/" + pageCount + ")</span>" : "";
        head.appendChild(el("div", "nav-fund", accentFund(fundName) + pageTag));
        head.appendChild(el("div", "nav-asof", asOf ? "As on " + asOf : ""));
        s.appendChild(head);

        var table = el("table", "nav-table");
        table.innerHTML =
          "<thead><tr>" +
          "<th>Plan</th><th>Option</th><th class='num'>NAV (per unit)</th>" +
          "</tr></thead>";
        var tbody = el("tbody");
        rows.forEach(function (r) {
          var tr = el("tr");
          tr.innerHTML =
            "<td class='plan'>" + (r.plan || "—") + "</td>" +
            "<td class='option'>" + (r.option || "—") + "</td>" +
            "<td class='num navval'>" + formatNav(r.nav) + "</td>";
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        s.appendChild(table);
        return s;
      }
    };
  }

  function accentFund(name) {
    // Highlight the word "Carnelian"
    return name.replace(/Carnelian/i, '<span class="accent">Carnelian</span>');
  }

  // ---------- build the full slide deck from data ----------
  function buildDeck(data) {
    var deck = [];

    var version = data.updated_at || data.nav_date || "";
    (data.banners || []).forEach(function (b) {
      deck.push(bannerSlide(b, version));
    });

    // Group NAV rows by fund, preserving order of first appearance
    var order = [];
    var byFund = {};
    (data.funds || []).forEach(function (f) {
      if (!byFund[f.fund]) {
        byFund[f.fund] = [];
        order.push(f.fund);
      }
      byFund[f.fund].push(f);
    });

    order.forEach(function (fund) {
      var pages = chunk(byFund[fund], CONFIG.rowsPerSlide);
      pages.forEach(function (rows, i) {
        deck.push(navSlide(fund, rows, i + 1, pages.length, data.nav_date));
      });
    });

    if (deck.length === 0) {
      deck.push({
        type: "empty",
        title: "Net Asset Value",
        ms: CONFIG.navMs,
        build: function () {
          var s = el("section", "slide nav-slide");
          s.appendChild(el("div", "nav-empty", "NAV data will appear here shortly."));
          return s;
        }
      });
    }
    return deck;
  }

  // ---------- render / rotate ----------
  function renderDeck(deck) {
    slides = deck;
    stage.innerHTML = "";
    slideEls = deck.map(function (slide) {
      var node = slide.build();
      stage.appendChild(node);
      return node;
    });

    dotsEl.innerHTML = "";
    deck.forEach(function () {
      dotsEl.appendChild(el("span", "dot"));
    });

    current = 0;
    show(0, true);
  }

  function show(i, immediate) {
    if (!slides.length) return;
    current = (i + slides.length) % slides.length;

    slideEls.forEach(function (n, idx) {
      n.classList.toggle("active", idx === current);
    });
    var dotNodes = dotsEl.children;
    for (var d = 0; d < dotNodes.length; d++) {
      dotNodes[d].classList.toggle("active", d === current);
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(next, slides[current].ms || CONFIG.navMs);
  }

  function next() {
    show(current + 1);
  }

  // ---------- data loading ----------
  function markFreshness(data) {
    sourceText.textContent = "carnelianmf.com";
    liveDot.className = "live-dot";
    if (data.updated_at) {
      var updated = new Date(data.updated_at);
      var ageH = (Date.now() - updated.getTime()) / 36e5;
      if (ageH > CONFIG.staleHours) {
        liveDot.className = "live-dot stale";
        sourceText.textContent = "carnelianmf.com · data may be delayed";
      }
    }
  }

  function loadData(initial) {
    var url = CONFIG.dataUrl + "?v=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var loading = document.getElementById("loading");
        if (loading) loading.remove();
        markFreshness(data);
        // Only rebuild the deck on first load or when nav date changes,
        // so mid-cycle refreshes don't jump the carousel.
        var newKey = (data.nav_date || "") + "|" + (data.funds || []).length + "|" + (data.banners || []).length;
        if (initial || newKey !== renderDeck._key) {
          renderDeck._key = newKey;
          renderDeck(buildDeck(data));
        }
      })
      .catch(function (err) {
        liveDot.className = "live-dot offline";
        sourceText.textContent = "offline — showing last update";
        if (initial) {
          var loading = document.getElementById("loading");
          if (loading) loading.textContent = "Waiting for data…";
        }
        // keep whatever is on screen; try again on the next refresh tick
        console.warn("data load failed:", err.message);
      });
  }

  // ---------- boot ----------
  updateClock();
  setInterval(updateClock, 15000);
  loadData(true);
  setInterval(function () { loadData(false); }, CONFIG.dataRefreshMs);
  setTimeout(function () { location.reload(); }, CONFIG.dailyReloadMs);
})();
