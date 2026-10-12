/* Aba "Pokédex": imita a tela de Pokédex do jogo (no celular, quase igual).
   Mesmos dados das outras telas (Agg/Store); só muda a cara:
     - lista de regiões em cards com os três iniciais à direita;
     - chips das 10 abas do jogo flutuando no rodapé, cada uma com sua cor;
     - tocar numa região abre a grade de números, com o cabeçalho que
       acompanha a região que está na tela.
   "Recém-registrados" e silhuetas (visto, não pego) não existem aqui: a
   planilha não guarda data de captura nem "visto". */

const GameDex = {
  /* Ordem e rótulos das abas do jogo (as mesmas do Dashboard.GO_ORDER).
     theme = [fundo topo, fundo base, texto, faixa do card]. */
  TABS: [
    { key: "pokemon",  pt: "POKÉMON",    en: "POKÉMON",  theme: ["#cdeff5", "#6cc8e4", "#1b86b0", "#16a3df"] },
    { key: "shiny",    pt: "BRILHANTE",  en: "SHINY",    theme: ["#fdf3d4", "#f5d98d", "#e09b14", "#f6ac0e"] },
    { key: "lucky",    pt: "SORTUDO",    en: "LUCKY",    theme: ["#fdedd2", "#f8c98e", "#ec8519", "#f2602a"] },
    { key: "xxl",      pt: "XXL",        en: "XXL",      theme: ["#d7e6f5", "#9fc2ea", "#3a6aab", "#2a7be0"] },
    { key: "xxs",      pt: "XXS",        en: "XXS",      theme: ["#dde2f6", "#a9b5e6", "#4555b3", "#5560e0"] },
    { key: "gmax",     pt: "G-MAX",      en: "G-MAX",    theme: ["#f2cddb", "#d5648f", "#cf447b", "#e2287f"] },
    { key: "mega",     pt: "MEGA",       en: "MEGA",     theme: ["#efd2dd", "#dea6bc", "#b4426b", "#c02f9a"] },
    { key: "shadow",   pt: "SOMBROSO",   en: "SHADOW",   theme: ["#ddd6f1", "#a497d6", "#6650bb", "#7b3dd2"] },
    { key: "purified", pt: "PURIFICADO", en: "PURIFIED", theme: ["#d6ede8", "#9fd1c8", "#279f8e", "#19b3b5"] },
    { key: "perfect",  pt: "★ 100%",     en: "★ 100%",   theme: ["#fbd9c6", "#e78a85", "#cf6178", "#e8466f"] }
  ],

  /* Os três da arte de cada região, na ordem da tela do jogo. */
  ART: {
    Kanto: [7, 4, 1], Johto: [152, 158, 155], Hoenn: [258, 252, 255],
    Sinnoh: [393, 390, 387], Unova: [498, 495, 501], Kalos: [656, 650, 653],
    Alola: [728, 722, 725], Galar: [816, 813, 810], Hisui: [900, 899, 901],
    Paldea: [909, 912, 906], Indefinida: [808]
  },

  tab: "pokemon",
  mode: "regions",       // "regions" | "grid"
  jumpTo: null,          // região pra rolar ao abrir a grade
  keepScroll: null,      // volta pra este scroll depois de redesenhar
  query: "",
  searchOpen: false,

  render(root) {
    const tab = this.TABS.find(x => x.key === this.tab) || this.TABS[0];
    const cat = Agg.byCat[tab.key];
    const st = Agg.stats(tab.key);
    const [top, bottom, ink, stripe] = tab.theme;

    document.body.classList.add("gd-on");
    const wrap = el("div", "gd");
    for (const [k, v] of [["--gd-top", top], ["--gd-bot", bottom], ["--gd-ink", ink], ["--gd-stripe", stripe]]) {
      document.body.style.setProperty(k, v);
    }
    root.appendChild(wrap);

    /* rolagens que dependem do layout: rodam no fim, já com tudo no DOM */
    this.afterRender = [];
    if (this.searchOpen) wrap.appendChild(this.searchBox());
    const q = this.query.trim().toLowerCase();
    if (this.mode === "grid" || q) this.renderGrid(wrap, tab, cat, st, q);
    else this.renderRegions(wrap, tab, cat, st);
    wrap.appendChild(this.dock(tab));
    for (const f of this.afterRender) f();
  },

  /* A aba Pokémon e as de forma (G-Max, Mega) listam tudo que existe,
     lançado ou não (o jogo mostra Mega Delphox e G-Max Melmetal vazios);
     as outras só o que já saiu. */
  showsAll(tab) {
    const cat = Agg.byCat[tab.key];
    return tab.key === "pokemon" || !!(cat && cat.scope === "entry");
  },

  /* regiões que o Pokédex do jogo mostra nesta aba */
  regionsFor(tab, st) {
    const all = this.showsAll(tab);
    return Agg.skeleton.regions.filter(r => {
      if (!Agg.inGameRegions.has(r)) return false;
      const b = st.byRegion[r];
      if (!b) return false;
      return all ? b.total > 0 : b.released > 0;
    });
  },

  /* ------------------------------------------------------ lista de regiões */
  renderRegions(wrap, tab, cat, st) {
    const head = el("div", "gd-top");
    head.append(el("span", "gd-title", "POKÉDEX"),
                el("span", "gd-total", t("gd.caught") + " " + st.total.caught));
    wrap.appendChild(head);

    const list = el("div", "gd-regions");
    for (const r of this.regionsFor(tab, st)) {
      const b = st.byRegion[r];
      const isDex = tab.key === "pokemon";
      const done = isDex ? b.caught >= b.total : b.released > 0 && b.caught >= b.released;
      const card = el("button", "gd-region" + (done ? " done" : "") + (b.caught === 0 ? " locked" : ""));
      card.type = "button";

      const info = el("div", "gd-rinfo");
      info.appendChild(el("div", "gd-rname", regionLabel(r).toUpperCase()));
      if (isDex) {
        if (done) info.appendChild(el("div", "gd-done", t("gd.done")));
        else {
          const bar = el("div", "gd-bar");
          const fill = el("span");
          fill.style.width = (b.total ? b.caught / b.total * 100 : 0) + "%";
          bar.appendChild(fill);
          info.appendChild(bar);
        }
        info.appendChild(el("div", "gd-rcount", b.caught + " / " + b.total));
        info.appendChild(this.medal(b.caught, b.total));
      } else {
        if (done) info.appendChild(el("div", "gd-done", t("gd.done")));
        info.appendChild(el("div", "gd-rcount", t("gd.caught") + " " + b.caught));
        if (b.caught === 0) {
          const lock = el("span", "gd-lock");
          lock.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2 0h6V8a3 3 0 0 0-6 0Z"/></svg>';
          info.appendChild(lock);
        }
      }
      card.appendChild(info);
      card.appendChild(this.art(r, b.caught === 0 && !isDex));

      card.addEventListener("click", () => {
        this.mode = "grid";
        this.jumpTo = r;
        App.rerender();
      });
      list.appendChild(card);
    }
    wrap.appendChild(list);
  },

  /* faixa diagonal + os iniciais */
  art(region, locked) {
    const box = el("div", "gd-art");
    box.appendChild(el("span", "gd-art-bg"));
    const mons = el("div", "gd-art-mons" + (locked ? " locked" : ""));
    for (const num of this.ART[region] || []) {
      const group = Agg.byNum.get(num);
      if (!group) continue;
      mons.appendChild(Sprites.img(Agg.baseEntry(num, group), false, "gd-art-mon"));
    }
    box.appendChild(mons);
    return box;
  },

  /* medalha de colecionador da região: bronze/prata/ouro/platina */
  medal(caught, total) {
    const f = total ? caught / total : 0;
    const tier = f >= 1 ? "plat" : f >= .8 ? "gold" : f >= .4 ? "silver" : "bronze";
    const m = el("span", "gd-medal " + tier);
    m.appendChild(Icons.svg("ball", 16));
    return m;
  },

  /* --------------------------------------------------------- grade */
  renderGrid(wrap, tab, cat, st, q) {
    const isDex = tab.key === "pokemon";
    const regions = this.regionsFor(tab, st);
    const all = this.showsAll(tab);
    let items = st.items.filter(it => regions.indexOf(it.region) !== -1 && (all || it.released));
    if (q) {
      items = items.filter(it => String(it.num).padStart(4, "0").indexOf(q) !== -1 ||
        String(it.num) === q ||
        it.entries.some(e => [e.namePt, e.nameEn, e.speciesPt, e.speciesEn]
          .some(s => s && s.toLowerCase().indexOf(q) !== -1)));
    }

    const topbar = document.querySelector(".topbar");
    document.body.style.setProperty("--gd-sticky", ((topbar ? topbar.offsetHeight : 0) + 8) + "px");
    const hdr = el("div", "gd-hdr");
    const row = el("div", "gd-hdr-row");
    const hName = el("span", "gd-hdr-name");
    const hPill = el("span", "gd-pill");
    const hIcon = cat ? Icons.badge(cat, 30) : el("span");
    hIcon.classList.add("gd-hdr-ico");
    row.append(hName, hPill, hIcon);
    hdr.appendChild(row);
    const hStats = el("div", "gd-hdr-stats");
    if (isDex && !q) hdr.appendChild(hStats);
    wrap.appendChild(hdr);

    const allStats = isDex ? Agg.allStats() : null;
    const setHeader = r => {
      const b = st.byRegion[r] || { caught: 0, total: 0 };
      hName.textContent = q ? t("gd.results") : regionLabel(r).toUpperCase();
      hPill.textContent = q ? String(items.length)
        : isDex ? b.caught + " / " + b.total : String(b.caught);
      if (isDex && !q) {
        hStats.textContent = "";
        for (const k of ["shiny", "lucky", "xxl", "xxs", "perfect"]) {
          const s = el("div", "gd-stat");
          const rb = allStats[k].byRegion[r];
          s.append(el("b", null, String(rb ? rb.caught : 0)),
                   el("span", null, (this.TABS.find(x => x.key === k)[LANG === "en" ? "en" : "pt"])));
          hStats.appendChild(s);
        }
      }
    };

    const body = el("div", "gd-sections");
    const sections = [];
    for (const r of regions) {
      const its = items.filter(it => it.region === r);
      if (!its.length) continue;
      const sec = el("section", "gd-sec");
      sec.dataset.region = r;
      sec.appendChild(el("h3", "gd-sec-h", regionLabel(r).toUpperCase()));
      const g = el("div", "gd-grid" + (tab.key === "gmax" ? " big" : ""));
      for (const it of its) g.appendChild(this.tile(it, tab, cat));
      sec.appendChild(g);
      body.appendChild(sec);
      sections.push(sec);
    }
    if (!sections.length) body.appendChild(el("p", "gd-empty", t("gd.none")));
    wrap.appendChild(body);

    if (sections.length) {
      const first = sections.find(s => s.dataset.region === this.jumpTo) || sections[0];
      setHeader(first.dataset.region);
      /* rola até a região escolhida depois que o layout existe */
      const target = this.jumpTo, keep = this.keepScroll;
      this.jumpTo = null;
      this.keepScroll = null;
      this.afterRender.push(() => {
        if (keep != null) window.scrollTo({ top: keep });
        else if (target && first !== sections[0]) {
          const y = first.getBoundingClientRect().top + window.scrollY - this.stickyOffset() + 4;
          window.scrollTo({ top: y });
        } else window.scrollTo({ top: 0 });
      });
      /* cabeçalho acompanha a região que está passando embaixo dele */
      let cur = first.dataset.region, raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!hdr.isConnected) { window.removeEventListener("scroll", onScroll); return; }
          const line = hdr.getBoundingClientRect().bottom + 2;
          let now = sections[0].dataset.region;
          for (const s of sections) if (s.getBoundingClientRect().top <= line) now = s.dataset.region;
          if (now !== cur) { cur = now; setHeader(now); }
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  },

  stickyOffset() {
    const top = document.querySelector(".topbar");
    const hdr = document.querySelector(".gd-hdr");
    return (top ? top.offsetHeight : 0) + (hdr ? hdr.offsetHeight + 12 : 0);
  },

  tile(it, tab, cat) {
    const got = it.got;
    const card = el("button", "gd-tile" + (got ? " got" : ""));
    card.type = "button";
    const no = String(it.num).padStart(4, "0");
    if (got) {
      /* mostra a forma que a pessoa marcou (a base, se tiver) */
      const mark = cat ? cat.mark : "caught";
      const shown = Store.has(it.display.id, mark) ? it.display
        : (it.entries.find(e => Store.has(e.id, mark)) || it.display);
      const shiny = tab.key === "shiny";
      if (tab.key === "lucky") card.classList.add("lucky");
      const sp = el("div", "gd-sprite");
      sp.appendChild(Sprites.img(shown, shiny));
      card.appendChild(sp);
      if (tab.key === "shadow" || tab.key === "purified") {
        const ic = el("span", "gd-tile-ico");
        ic.appendChild(Icons.svg(tab.key === "shadow" ? "flame" : "purify", 22));
        card.appendChild(ic);
      }
    }
    card.appendChild(el("span", "gd-no", no));
    card.title = labelFor(it, cat);
    card.addEventListener("click", () => this.openDetail(it));
    return card;
  },

  /* Abre a ficha; ao fechar, redesenha (as marcas podem ter mudado)
     sem perder o lugar na grade. */
  openDetail(it) {
    const before = JSON.stringify(Store.marks);
    Detail.openEntry(it.display, it.entries);
    const sheet = document.getElementById("sheet");
    if (!sheet) return;
    const obs = new MutationObserver(() => {
      if (sheet.isConnected) return;
      obs.disconnect();
      if (App.view !== "gamedex" || JSON.stringify(Store.marks) === before) return;
      const n = document.querySelector(".gd-hdr-name");
      this.keepScroll = window.scrollY;
      this.jumpTo = Agg.skeleton.regions.find(r => n && regionLabel(r).toUpperCase() === n.textContent) || null;
      App.rerender();
    });
    obs.observe(document.body, { childList: true });
  },

  /* ------------------------------------------------- busca */
  searchBox() {
    const box = el("div", "gd-search");
    const inp = document.createElement("input");
    inp.type = "search";
    inp.placeholder = t("gd.search");
    inp.value = this.query;
    let timer = 0;
    inp.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.query = inp.value;
        App.rerender();
        const again = document.querySelector(".gd-search input");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 220);
    });
    box.appendChild(inp);
    requestAnimationFrame(() => { if (!this.query) inp.focus(); });
    return box;
  },

  /* ------------------------------------------------- rodapé flutuante */
  dock(tab) {
    const dock = el("div", "gd-dock");
    const chips = el("div", "gd-chips");
    let active = null;
    for (const x of this.TABS) {
      if (!Agg.byCat[x.key]) continue;
      const c = el("button", "gd-chip" + (x.key === tab.key ? " on" : ""), LANG === "en" ? x.en : x.pt);
      c.type = "button";
      if (x.key === tab.key) active = c;
      c.addEventListener("click", () => {
        if (x.key === this.tab) return;
        this.tab = x.key;
        /* na grade, continua na região que estava na tela */
        if (this.mode === "grid") {
          const n = document.querySelector(".gd-hdr-name");
          const r = Agg.skeleton.regions.find(r => n && regionLabel(r).toUpperCase() === n.textContent);
          this.jumpTo = r || null;
        }
        App.rerender();
      });
      chips.appendChild(c);
    }
    dock.appendChild(chips);
    this.afterRender.push(() => {
      if (!active) return;
      chips.style.scrollBehavior = "auto";
      chips.scrollLeft = active.offsetLeft - (chips.clientWidth - active.offsetWidth) / 2;
      chips.style.scrollBehavior = "";
    });

    const btns = el("div", "gd-btns");
    const search = this.roundBtn("search", t("gd.search"), () => {
      this.searchOpen = !this.searchOpen;
      if (!this.searchOpen) this.query = "";
      App.rerender();
    });
    const close = this.roundBtn(null, t("gd.close"), () => {
      if (this.query || this.searchOpen) { this.query = ""; this.searchOpen = false; }
      else this.mode = "regions";
      App.rerender();
    });
    close.querySelector(".gd-round").innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    btns.append(search, close);
    if (this.mode === "grid" && !this.query) {
      const reg = this.roundBtn(null, t("gd.regions"), () => {
        this.mode = "regions";
        App.rerender();
      }, true);
      reg.querySelector(".gd-round").innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="6" y="3.5" width="12" height="5" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="10" width="16" height="4" rx="1.4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="15.5" width="12" height="5" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      btns.appendChild(reg);
    } else btns.appendChild(el("span", "gd-btn-slot"));
    dock.appendChild(btns);

    /* setinhas da borda direita: vai pro topo / pro fim */
    if (this.mode === "grid") {
      const jump = el("button", "gd-jump");
      jump.type = "button";
      jump.setAttribute("aria-label", t("gd.jump"));
      jump.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m7 9 5-5 5 5M7 15l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      jump.addEventListener("click", () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: window.scrollY > max / 2 ? 0 : max, behavior: "smooth" });
      });
      dock.appendChild(jump);
    }
    return dock;
  },

  roundBtn(icon, label, onClick, withLabel) {
    const b = el("button", "gd-rbtn" + (withLabel ? " labeled" : ""));
    b.type = "button";
    b.setAttribute("aria-label", label);
    const r = el("span", "gd-round");
    if (icon) r.appendChild(Icons.svg(icon, 22));
    b.appendChild(r);
    if (withLabel) b.appendChild(el("span", "gd-rlabel", label.toUpperCase()));
    b.addEventListener("click", onClick);
    return b;
  }
};
