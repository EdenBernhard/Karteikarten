/* Karteikarten – statische Web-App ohne Build.
   Decks liegen in /decks/*.json, die Übersicht in /decks/index.json.
   Fortschritt pro Deck im localStorage dieses Browsers. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const crumb = $("#crumb");
  const cache = new Map();
  let decksIndex = null;

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const strip = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

  function math(el) {
    if (!el || !window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false
      });
    } catch (e) { /* Formel bleibt als Text stehen */ }
  }


  // Mini-Markdown für KI-Antworten (Formeln bleiben für KaTeX unangetastet)
  function md(src) {
    const keep = [];
    const hold = h => "\u0000" + (keep.push(h) - 1) + "\u0000";
    let t = String(src)
      .replace(/```[a-z]*\n?([\s\S]*?)(```|$)/g, (_, code) => hold(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`))
      .replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => hold(esc(m)))
      .replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${esc(code)}</code>`));
    t = esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    const out = []; let list = null;
    for (const line of t.split("\n")) {
      const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
      const kind = ul ? "ul" : ol ? "ol" : null;
      if (list && list.kind !== kind) { out.push(`<${list.kind}>${list.items.join("")}</${list.kind}>`); list = null; }
      if (kind) { (list ||= { kind, items: [] }).items.push(`<li>${(ul || ol)[1]}</li>`); continue; }
      if (h) out.push(`<p><b>${h[1]}</b></p>`);
      else if (line.trim()) out.push(`<p>${line}</p>`);
    }
    if (list) out.push(`<${list.kind}>${list.items.join("")}</${list.kind}>`);
    return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }

  function setTheme(meta) {
    const r = document.documentElement.style;
    r.setProperty("--deck", (meta && meta.color) || "#6741d9");
    r.setProperty("--deck2", (meta && (meta.color2 || meta.color)) || "#4c6ef5");
  }

  const store = {
    get(id) { try { return JSON.parse(localStorage.getItem("kk:" + id) || "{}") || {}; } catch (e) { return {}; } },
    set(id, v) { try { localStorage.setItem("kk:" + id, JSON.stringify(v)); } catch (e) { } }
  };

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + ": " + r.status);
    return r.json();
  }
  async function loadIndex() {
    if (!decksIndex) decksIndex = await getJSON("/decks/index.json");
    return decksIndex;
  }
  async function loadDeck(meta) {
    if (cache.has(meta.id)) return cache.get(meta.id);
    const d = await getJSON("/decks/" + meta.file);
    d.cards.forEach(c => { c.id = hash(c.q); c.text = strip(c.q + " " + c.a); });
    d.meta = meta;
    cache.set(meta.id, d);
    return d;
  }

  // ---------- routing ----------
  async function route() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    window.scrollTo(0, 0);
    try {
      const idx = await loadIndex();
      const meta = idx.find(d => d.id === id);
      if (!id || !meta) return renderHome(idx);
      renderDeck(await loadDeck(meta));
    } catch (e) {
      app.innerHTML = `<div class="err">Konnte die Karten nicht laden (${esc(e.message)}). Bist du offline und hast die App noch nie geöffnet?</div>`;
    }
  }
  window.addEventListener("hashchange", route);

  // ---------- home ----------
  async function renderHome(idx) {
    document.title = "Karteikarten";
    crumb.textContent = "";
    setTheme(idx[0]);
    app.innerHTML = `<h1>Was lernen wir <span class="hl">heute?</span></h1><p class="sub">Wähle einen Stapel. Dein Fortschritt bleibt in diesem Browser gespeichert.</p>
      <div class="decks">${idx.map(d => `
        <a class="deck" href="#${esc(d.id)}" data-id="${esc(d.id)}" style="--c:${esc(d.color || "#6741d9")};--c2:${esc(d.color2 || d.color || "#4c6ef5")}">
          <h2>${esc(d.title)}</h2><p>${esc(d.subtitle || "")}</p>
          <div class="pct">–<small>% gewusst</small></div>
          <span class="meta">lädt …</span>
          <div class="bar"><span class="bg"></span><span class="ba"></span></div>
          <span class="go" aria-hidden="true">→</span>
        </a>`).join("")}</div>`;
    for (const meta of idx) {
      try {
        const d = await loadDeck(meta);
        const p = store.get(meta.id);
        const g = d.cards.filter(c => p[c.id] === "good").length;
        const a = d.cards.filter(c => p[c.id] === "again").length;
        const el = app.querySelector(`.deck[data-id="${CSS.escape(meta.id)}"]`);
        if (!el) continue;
        el.querySelector(".pct").innerHTML = `${Math.round(g / d.cards.length * 100)}<small>% gewusst</small>`;
        el.querySelector(".meta").textContent = `${d.cards.length} Karten · ${a} zum Wiederholen`;
        el.querySelector(".bg").style.width = (g / d.cards.length * 100) + "%";
        el.querySelector(".ba").style.width = (a / d.cards.length * 100) + "%";
      } catch (e) { /* Kachel bleibt ohne Zahlen */ }
    }
  }

  // ---------- deck ----------
  function renderDeck(deck) {
    const topics = deck.topics || [];
    const topicOf = id => topics.find(t => t.id === id) || { id, label: id, color: "var(--muted)" };
    let progress = store.get(deck.meta.id);
    const save = () => store.set(deck.meta.id, progress);

    const S = {
      mode: "learn",
      active: new Set(topics.map(t => t.id)),
      onlyOpen: false,
      deck: [], idx: 0, flipped: false, query: "", streak: 0
    };
    setTheme(deck.meta);

    document.title = deck.title + " · Karteikarten";
    crumb.textContent = deck.title;

    app.innerHTML = `
      <div class="head">
        <div><h1>${esc(deck.title)}</h1><p class="sub">${esc(deck.meta.subtitle || "")}</p></div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="modes" role="group" aria-label="Ansicht">
        <button data-mode="learn" aria-pressed="true">Lernen</button>
        <button data-mode="list" aria-pressed="false">Alle Karten</button>
      </div>
      <div class="filters" id="filters" role="group" aria-label="Themen filtern"></div>
      <div id="view"></div>`;

    const view = $("#view");
    app.querySelectorAll(".modes button").forEach(b => b.onclick = () => {
      S.mode = b.dataset.mode;
      app.querySelectorAll(".modes button").forEach(x => x.setAttribute("aria-pressed", x === b));
      draw();
    });

    function pool() { return deck.cards.filter(c => S.active.has(c.topic)); }

    function stats() {
      const p = pool();
      const g = p.filter(c => progress[c.id] === "good").length;
      const a = p.filter(c => progress[c.id] === "again").length;
      $("#stats").innerHTML = `<span class="pill pg">✓ ${g} gewusst</span><span class="pill pa">↺ ${a} nochmal</span><span class="pill pn">${p.length - g - a} neu</span>` +
        (S.streak >= 2 ? `<span class="pill streak" id="streak">🔥 ${S.streak} in Folge</span>` : "");
      const bg = $("#barG"), ba = $("#barA");
      if (bg) { bg.style.width = (p.length ? g / p.length * 100 : 0) + "%"; ba.style.width = (p.length ? a / p.length * 100 : 0) + "%"; }
    }

    function filters() {
      const f = $("#filters");
      const all = S.active.size === topics.length;
      f.innerHTML = "";
      const mk = (label, pressed, onclick, color) => {
        const b = document.createElement("button");
        b.className = color ? "chip" : "chip all";
        if (color) b.style.setProperty("--t", color);
        b.setAttribute("aria-pressed", pressed);
        b.innerHTML = (color ? `<span class="dot"></span>` : "") + esc(label);
        b.onclick = onclick; f.appendChild(b);
      };
      mk("Alle", all, () => { S.active = new Set(topics.map(t => t.id)); rebuild(); });
      topics.forEach(t => {
        const n = deck.cards.filter(c => c.topic === t.id).length;
        mk(`${t.label} (${n})`, !all && S.active.has(t.id), () => {
          if (all) S.active = new Set([t.id]);
          else if (S.active.has(t.id)) { S.active.delete(t.id); if (!S.active.size) S.active = new Set(topics.map(x => x.id)); }
          else S.active.add(t.id);
          rebuild();
        }, t.color);
      });
    }

    function rebuild() {
      S.deck = pool().filter(c => !S.onlyOpen || progress[c.id] !== "good");
      shuffleArr(S.deck);
      S.idx = 0; S.flipped = false;
      filters(); draw();
    }
    function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

    function draw() { S.mode === "learn" ? drawLearn() : drawList(); stats(); }

    // ----- learn mode -----
    function drawLearn() {
      view.innerHTML = `
        <div class="controls">
          <label><input type="checkbox" id="onlyOpen" ${S.onlyOpen ? "checked" : ""}> nur noch nicht gewusste</label>
          <button class="btn-ghost" id="shuffle">Mischen</button>
          <button class="btn-ghost" id="reset">Fortschritt zurücksetzen</button>
        </div>
        <div class="bar" aria-hidden="true"><span class="bg" id="barG"></span><span class="ba" id="barA"></span></div>
        <div id="stage"></div>
        <div class="nav">
          <button class="big again" id="btnAgain">Nochmal</button>
          <button class="big flip" id="btnFlip">Umdrehen</button>
          <button class="big good" id="btnGood">Gewusst</button>
          <span class="grow"></span>
          <button class="btn-ghost" id="prev" aria-label="Vorherige Karte">←</button>
          <span class="pos" id="pos"></span>
          <button class="btn-ghost" id="next" aria-label="Nächste Karte">→</button>
        </div>
        <section class="ai" id="ai">
          <button class="ai-toggle" id="aiToggle" aria-expanded="false"><span class="ai-ico">✦</span> Frag die KI zu dieser Karte <span class="chev">▾</span></button>
          <div class="ai-body" id="aiBody" hidden>
            <div class="ai-log" id="aiLog"></div>
            <div class="ai-chips" id="aiChips">
              <button data-q="Ich komm nicht drauf – gib mir einen Hinweis.">💡 Hinweis</button>
              <button data-q="Erklär mir das bitte einfacher, Schritt für Schritt.">🧩 Einfacher erklären</button>
              <button data-q="Warum ist das so? Erklär mir den Hintergrund.">❓ Warum?</button>
              <button data-q="Gib mir ein konkretes Beispiel dazu.">🔍 Beispiel</button>
            </div>
            <form class="ai-form" id="aiForm"><textarea id="aiIn" rows="1" placeholder="Deine Frage zur Karte …"></textarea><button class="ai-send" id="aiSend" aria-label="Senden">➤</button></form>
          </div>
        </section>
        <p class="keys"><kbd>Leertaste</kbd> umdrehen · <kbd>1</kbd> nochmal · <kbd>2</kbd> gewusst · <kbd>←</kbd> <kbd>→</kbd> blättern</p>`;
      setupAI();
      $("#onlyOpen").onchange = e => { S.onlyOpen = e.target.checked; rebuild(); };
      $("#shuffle").onclick = () => { shuffleArr(S.deck); S.idx = 0; S.flipped = false; drawCard(); };
      const rb = $("#reset");
      rb.onclick = () => {
        if (rb.dataset.confirm) { progress = {}; save(); rebuild(); return; }
        rb.dataset.confirm = "1"; rb.textContent = "Wirklich zurücksetzen?";
        setTimeout(() => { if (rb.isConnected) { delete rb.dataset.confirm; rb.textContent = "Fortschritt zurücksetzen"; } }, 3000);
      };
      $("#btnFlip").onclick = flip;
      $("#btnGood").onclick = () => rate("good");
      $("#btnAgain").onclick = () => rate("again");
      $("#prev").onclick = () => go(-1);
      $("#next").onclick = () => go(1);
      drawCard();
    }

    function drawCard() {
      stats();
      const st = $("#stage");
      if (!st) return;
      const has = S.deck.length > 0 && S.idx < S.deck.length;
      ["#btnAgain", "#btnFlip", "#btnGood", "#prev", "#next"].forEach(s => $(s).disabled = !has);
      if (!has) {
        st.innerHTML = `<div class="done"><h2>${S.deck.length ? "Stapel durch! 🎉" : (S.onlyOpen ? "Alles gewusst! 🎉" : "Keine Karten")}</h2>
          <p class="sub">${S.onlyOpen ? "Keine offenen Karten in dieser Auswahl." : "Misch neu oder wähle andere Themen."}</p>
          <p><button class="btn-ghost" id="restart">Von vorn</button></p></div>`;
        $("#pos").textContent = "";
        $("#restart").onclick = rebuild;
        if (S.deck.length || S.onlyOpen) confetti(st.querySelector(".done"));
        return;
      }
      const c = S.deck[S.idx], t = topicOf(c.topic);
      const mark = progress[c.id] === "good" ? " · gewusst" : progress[c.id] === "again" ? " · nochmal" : "";
      st.innerHTML = `<div class="scene enter"><div class="card ${S.flipped ? "flipped" : ""}" id="card" tabindex="0" role="button" aria-label="Karte umdrehen" style="--t:${esc(t.color)}">
        <div class="face front"><span class="tag"><span class="dot"></span>${esc(t.label)}${mark}</span><div class="q">${c.q}</div><span class="hint">Tippen oder Leertaste zum Umdrehen</span></div>
        <div class="face back"><span class="tag"><span class="dot"></span>${esc(t.label)} · Antwort</span><div class="a">${c.a}</div></div>
      </div></div>`;
      const card = $("#card");
      math(card);
      card.onclick = flip;
      requestAnimationFrame(() => {
        const h = Math.max(340, card.querySelector(".back").scrollHeight, card.querySelector(".front").scrollHeight);
        card.style.minHeight = h + "px";
      });
      $("#pos").textContent = `${S.idx + 1} / ${S.deck.length}`;
      drawChat();
    }


    // ----- KI-Tutor -----
    const chats = new Map(); // Karten-ID → [{role, content}]
    let aiOpen = false, aiBusy = false;
    const current = () => (S.deck.length && S.idx < S.deck.length) ? S.deck[S.idx] : null;

    function setupAI() {
      const tg = $("#aiToggle"), body = $("#aiBody"), inp = $("#aiIn");
      const show = (open, focus) => { aiOpen = open; body.hidden = !open; tg.setAttribute("aria-expanded", open); $("#ai").classList.toggle("open", open); if (open) { drawChat(); if (focus) inp.focus(); } };
      tg.onclick = () => show(!aiOpen, true);
      show(aiOpen);
      $("#aiChips").onclick = e => { const b = e.target.closest("button"); if (b) ask(b.dataset.q); };
      $("#aiForm").onsubmit = e => { e.preventDefault(); ask(inp.value); };
      inp.oninput = () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 160) + "px"; };
      inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(inp.value); } };
    }

    function drawChat() {
      const log = $("#aiLog"); if (!log) return;
      const c = current();
      const msgs = c ? (chats.get(c.id) || []) : [];
      log.innerHTML = msgs.length ? msgs.map(m => `<div class="msg ${m.role === "user" ? "me" : "bot"}${m.error ? " err" : ""}">${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("")
        : `<p class="ai-empty">${c ? "Frag alles, was dir an dieser Karte unklar ist. Solange die Karte nicht umgedreht ist, gibt die KI erst mal nur Hinweise." : "Keine Karte ausgewählt."}</p>`;
      math(log);
      log.scrollTop = log.scrollHeight;
      $("#aiChips").hidden = msgs.length > 0;
      $("#aiSend").disabled = aiBusy || !c;
    }

    async function ask(text) {
      text = (text || "").trim();
      const c = current();
      if (!text || !c || aiBusy) return;
      const inp = $("#aiIn"); inp.value = ""; inp.style.height = "auto";
      const msgs = chats.get(c.id) || []; chats.set(c.id, msgs);
      msgs.push({ role: "user", content: text });
      const bot = { role: "assistant", content: "" }; msgs.push(bot);
      aiBusy = true; drawChat();
      const log = $("#aiLog"), el = log.lastElementChild; el.classList.add("typing");
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json", "x-access-code": localStorage.getItem("kk:code") || "" },
          body: JSON.stringify({ deck: deck.title, topic: topicOf(c.topic).label, q: c.q, a: c.a, revealed: S.flipped,
            messages: msgs.filter(m => m !== bot && !m.error).map(({ role, content }) => ({ role, content })) })
        });
        if (res.status === 401) {
          const code = prompt("Zugangscode für die KI:");
          msgs.splice(-2, 2); aiBusy = false;
          if (code) { localStorage.setItem("kk:code", code.trim()); return ask(text); }
          drawChat(); return;
        }
        if (!res.ok || !res.body) {
          let m = `Fehler ${res.status}`;
          try { m = (await res.json()).error || m; } catch { if (res.status === 404) m = "Die KI-Funktion gibt es nur in der auf Vercel gehosteten App."; }
          throw new Error(m);
        }
        const rd = res.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { done, value } = await rd.read(); if (done) break;
          bot.content += dec.decode(value, { stream: true });
          if (current() === c && el.isConnected) { el.innerHTML = md(bot.content); log.scrollTop = log.scrollHeight; }
        }
        if (!bot.content.trim()) throw new Error("Leere Antwort von der KI.");
      } catch (e) {
        bot.error = true;
        bot.content = navigator.onLine === false ? "Du bist offline – die KI braucht eine Internetverbindung." : (e.message || "Unbekannter Fehler.");
      } finally {
        aiBusy = false;
        if (current() === c) drawChat(); else { const s = $("#aiSend"); if (s) s.disabled = false; }
      }
    }

    function flip() { if (!S.deck.length || S.idx >= S.deck.length) return; S.flipped = !S.flipped; $("#card")?.classList.toggle("flipped", S.flipped); }
    function go(d) { if (!S.deck.length) return; S.idx = Math.min(Math.max(S.idx + d, 0), S.deck.length - 1); S.flipped = false; drawCard(); }
    let busy = false;
    function rate(v) {
      if (busy || !S.deck.length || S.idx >= S.deck.length) return;
      const c = S.deck[S.idx]; progress[c.id] = v; save();
      S.streak = v === "good" ? S.streak + 1 : 0;
      const scene = $("#stage .scene");
      const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (scene && !reduce) {
        busy = true;
        scene.classList.remove("enter");
        scene.classList.add(v === "good" ? "out-good" : "out-again");
        setTimeout(() => { busy = false; advance(c, v); }, 260);
      } else advance(c, v);
    }
    function advance(c, v) {
      if (v === "again") {
        const card = S.deck.splice(S.idx, 1)[0];
        S.deck.splice(Math.min(S.deck.length, S.idx + 3 + Math.floor(Math.random() * 4)), 0, card);
      } else if (S.onlyOpen) S.deck.splice(S.idx, 1);
      else S.idx++;
      S.flipped = false; drawCard();
      const sk = $("#streak"); if (sk && v === "good") sk.classList.add("bump");
    }

    function confetti(host) {
      if (!host || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
      const cols = ["#ffd43b", "#ff6b6b", "#69db7c", "#4dabf7", "#f783ac", "#ffffff", "#ffa94d"];
      for (let i = 0; i < 70; i++) {
        const p = document.createElement("span");
        p.className = "confetti";
        p.style.left = Math.random() * 100 + "%";
        p.style.background = cols[i % cols.length];
        p.style.animationDuration = (1.6 + Math.random() * 1.8) + "s";
        p.style.animationDelay = (Math.random() * .6) + "s";
        p.style.transform = `rotate(${Math.random() * 360}deg)`;
        host.appendChild(p);
      }
    }

    // ----- list mode -----
    function drawList() {
      view.innerHTML = `<input class="search" id="q" type="search" placeholder="In Fragen und Antworten suchen …" value="${esc(S.query)}"><div class="list" id="list"></div>`;
      const q = $("#q");
      q.oninput = () => { S.query = q.value; fillList(); };
      fillList();
    }
    function fillList() {
      const terms = S.query.toLowerCase().split(/\s+/).filter(Boolean);
      const items = pool().filter(c => terms.every(t => c.text.includes(t)));
      const list = $("#list");
      if (!items.length) { list.innerHTML = `<p class="empty">Keine Karte gefunden.</p>`; return; }
      list.innerHTML = items.map(c => {
        const t = topicOf(c.topic);
        const s = progress[c.id] === "good" ? "gewusst" : progress[c.id] === "again" ? "nochmal" : "";
        const cls = progress[c.id] === "good" ? "good" : progress[c.id] === "again" ? "again" : "";
        return `<details class="item" style="--t:${esc(t.color)}"><summary><span class="qt">${c.q}</span>${s ? `<span class="st ${cls}">${s}</span>` : ""}</summary><div class="a">${c.a}</div></details>`;
      }).join("");
      math(list);
    }

    // keyboard (only while this deck is shown)
    const onKey = e => {
      if (!document.body.contains(view)) { document.removeEventListener("keydown", onKey); return; }
      if (S.mode !== "learn" || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "1") rate("again");
      else if (e.key === "2") rate("good");
    };
    document.addEventListener("keydown", onKey);

    rebuild();
  }

  // ---------- start ----------
  // KaTeX lädt per defer vor app.js; falls nicht (offline), läuft alles ohne Formelsatz.
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => { });
  }
})();
