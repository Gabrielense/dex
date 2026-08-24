/* Telas: Painel, Faltantes, Linha do tempo, e a ficha de cada entrada. */

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
/* 100% só quando realmente completo — 952/954 é 99%, não 100%. */
const pct = (a, b) => {
  if (!b) return 0;
  if (a >= b) return 100;
  return Math.min(99, Math.floor(a / b * 100));
};
const nameOf = e => (LANG === "en" ? (e.nameEn || e.namePt) : e.namePt);
const speciesOf = e => (LANG === "en" ? (e.speciesEn || e.speciesPt) : e.speciesPt);
const catLabel = c => (LANG === "en" ? c.labelEn : c.labelPt);
const catShort = c => (LANG === "en" ? (c.shortEn || c.labelEn) : (c.shortPt || c.labelPt));
const labelFor = (it, cat) =>
  cat && cat.scope === "dex" ? speciesOf(it.display) : nameOf(it.display);

/* "faltam N" (PT: verbo antes do número, singular em N=1) vs "N missing"
   (EN: como já era). Só a ordem/gênero do PT muda — o EN fica intacto. */
const missingLabel = n => LANG === "en"
  ? n + " " + t("dash.missing")
  : t(n === 1 ? "dash.missing1" : "dash.missing") + " " + n;

/* "Gen 10" ainda não tem nome oficial em PT — mostra "10ª geração" só na
   tela; o valor cru continua "Gen 10" pra bater com os dados. */
const regionLabel = r => (r === "Gen 10" && LANG === "pt") ? "10ª geração" : r;

function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = el("div", "toast");
  t.append(Icons.svg("check", 15), el("span", null, msg));
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1900);
}

/* Grade paginada: renderizar 950 cards (e 950 <img>) de uma vez era o maior
   consumo de memória do site. Agora entram em blocos de 240 com um botão
   "mostrar mais" — o DOM e as imagens decodificadas ficam limitados ao que
   o usuário realmente pediu pra ver. */
function pagedGrid(items, makeCard, pageSize) {
  pageSize = pageSize || 240;
  const holder = el("div");
  const g = el("div", "grid");
  holder.appendChild(g);
  let shown = 0;
  const more = el("button", "btn ghost");
  more.style.cssText = "display:block;margin:12px auto 0";
  const chunk = () => {
    const end = Math.min(items.length, shown + pageSize);
    for (; shown < end; shown++) g.appendChild(makeCard(items[shown]));
    if (shown >= items.length) more.remove();
    else more.textContent = t("ui.showMore", { n: items.length - shown });
  };
  more.addEventListener("click", chunk);
  chunk();
  if (shown < items.length) holder.appendChild(more);
  return holder;
}

function sectionHead(title, count, color) {
  const h = el("div", "section-head");
  if (color) h.style.borderLeftColor = color;
  h.appendChild(el("h2", null, title));
  if (count != null) h.appendChild(el("span", "n", count));
  return h;
}

/* ============================================================== PAINEL */
const Dashboard = {
  /* As 10 sub-dexes na MESMA ordem das abas do Pokédex do jogo — é a régua
     de conferência rápida na hora de atualizar olhando o celular. */
  GO_ORDER: [
    ["pokemon", "POKÉMON", "POKÉMON"], ["shiny", "BRILHANTE", "SHINY"],
    ["lucky", "SORTUDO", "LUCKY"], ["xxl", "XXL", "XXL"], ["xxs", "XXS", "XXS"],
    ["gmax", "G-MAX", "G-MAX"], ["mega", "MEGA", "MEGA"],
    ["shadow", "SOMBROSO", "SHADOW"], ["purified", "PURIFICADO", "PURIFIED"],
    ["perfect", "★ 100%", "★ 100%"]
  ],

  render(root) {
    const all = Agg.allStats();

    const intro = el("div", "panel");
    intro.append(el("h2", null, t("dash.title")),
                 el("p", "sub", Store.isEmpty() ? t("dash.noData") : t("dash.sub")));
    if (!Store.isEmpty()) intro.appendChild(this.goStrip(all));
    root.appendChild(intro);

    const groups = [
      ["dex", t("dash.groupDex")],
      ["special", t("dash.groupSpecial")],
      ["variant", t("dash.groupVariant")]
    ];
    for (const [g, label] of groups) {
      const cats = Agg.categories.filter(c => c.group === g);
      if (!cats.length) continue;
      const p = el("div", "panel");
      p.appendChild(sectionHead(label, null, cats[0].color));
      const grid = el("div", "kpis");
      for (const c of cats) grid.appendChild(this.card(c, all[c.key].total));
      p.appendChild(grid);
      root.appendChild(p);
    }

    root.appendChild(this.genderPanel());

    /* uma matriz por grupo — 20 colunas de símbolos numa tabela só era ilegível */
    for (const [g, label] of groups) {
      const cats = Agg.categories.filter(c => c.group === g);
      if (!cats.length) continue;
      root.appendChild(this.matrix(all, cats, label));
    }
  },

  /* régua rápida na ordem do jogo: número "pegos", igual à tela do Pokédex */
  goStrip(all) {
    const strip = el("div", "gostrip");
    for (const [key, pt, en] of this.GO_ORDER) {
      const cat = Agg.byCat[key];
      const s = all[key].total;
      const chip = el("button", "gochip");
      chip.type = "button";
      chip.style.setProperty("--c", cat.color);
      const head = el("div", "gochip-head");
      head.append(Icons.badge(cat, 18),
                  el("span", null, LANG === "en" ? en : pt));
      chip.append(head, el("div", "gochip-n", String(s.caught)));
      chip.title = `${catLabel(cat)} — ${s.caught} / ${s.released}`;
      chip.addEventListener("click", () => App.go("lists", { cat: key }));
      strip.appendChild(chip);
    }
    return strip;
  },

  card(cat, s) {
    const b = el("button", "kpi");
    b.type = "button";
    b.style.setProperty("--c", cat.color);
    const miss = s.released - s.caught;
    if (miss <= 0 && s.released > 0) b.classList.add("done");

    const top = el("div", "kpi-top");
    top.append(Icons.badge(cat, 22), el("span", "kpi-name", catLabel(cat)));

    const num = el("div", "kpi-num");
    num.append(document.createTextNode(String(s.caught)),
               el("span", "of", " / " + s.released));

    const bar = el("div", "bar");
    const fill = el("i");
    const p = pct(s.caught, s.released);
    fill.style.width = p + "%";
    if (p >= 100) fill.className = "full";
    bar.appendChild(fill);

    const sub = el("div", "kpi-sub");
    sub.append(el("span", null, p + "%"),
      el("span", "kpi-miss" + (miss <= 0 ? " zero" : ""),
         miss <= 0 ? t("dash.complete") : missingLabel(miss)));

    b.append(top, num, bar, sub);
    /* Só no card Pokémon: nos outros, "não lançado" ou é o mesmo número do
       Pokémon (XXL/XXS/100%/Sortudo travam na mesma data-base — repetir
       seria ruído) ou é uma aposta que não dá pra fazer (Sombroso,
       Purificado, Dinamax, Fantasia sombrosa etc. não têm garantia de que
       algum dia saem pra todo mundo). Só a dex em si é praticamente certa
       de chegar com o tempo — é o único "não lançado" que faz sentido citar. */
    const unrel = s.total - s.released;
    if (unrel > 0 && cat.key === "pokemon") {
      b.appendChild(el("div", "kpi-sub", t("lists.unreleasedCount", { n: unrel })));
    }
    b.title = `${catLabel(cat)}\n${s.caught} / ${s.released} ${t("dash.released")}\n` +
              `${t("dash.total")}: ${s.total}`;
    b.addEventListener("click", () => App.go("lists", { cat: cat.key }));
    return b;
  },

  /* --------- gênero: as três perguntas --------- */
  genderPanel() {
    const p = el("div", "panel");
    p.appendChild(sectionHead(t("gender.title"), null, "#7c5cd6"));

    if (Store.isEmpty()) {
      p.appendChild(el("p", "sub", t("dash.noData")));
      return p;
    }
    const g = Agg.genderStats();
    const grid = el("div", "kpis");

    /* Mesmo cartão das outras seções (ícone, número, barra, faltam/completo) —
       sem pergunta nem resposta, só o dado. Quando não há um "total" que
       faça sentido (cartão 3), o cartão fica sem barra. */
    const mk = (icon, color, label, caught, total, missN, onClick) => {
      const b = el("button", "kpi");
      b.type = "button";
      b.style.setProperty("--c", color);
      if (missN <= 0) b.classList.add("done");
      const top = el("div", "kpi-top");
      top.append(Icons.svg(icon, 20), el("span", "kpi-name", label));
      const num = el("div", "kpi-num");
      if (total != null) {
        num.append(document.createTextNode(String(caught)), el("span", "of", " / " + total));
        const bar = el("div", "bar");
        const fill = el("i");
        const pc = pct(caught, total);
        fill.style.width = pc + "%";
        if (pc >= 100) fill.className = "full";
        bar.appendChild(fill);
        const sub = el("div", "kpi-sub");
        sub.append(el("span", null, pc + "%"),
          el("span", "kpi-miss" + (missN <= 0 ? " zero" : ""),
             missN <= 0 ? t("dash.complete") : missingLabel(missN)));
        b.append(top, num, bar, sub);
      } else {
        num.textContent = String(caught);
        b.append(top, num);
      }
      if (onClick) b.addEventListener("click", onClick);
      else b.style.cursor = "default";
      return b;
    };

    /* 1 — só de um gênero: quem já tem UM registrado e falta o outro. Não
       tem um "total" natural (não é "de quantos"), fica sem barra. Espécies
       sem nenhum dos dois registrados não entram aqui — isso é dex faltando,
       não gênero faltando. */
    const onlyN = g.onlyM.length + g.onlyF.length;
    const only = mk("male", "#3a6fb0", t("gender.dexLabel"), onlyN, null, onlyN,
      onlyN ? () => GenderList.open("only") : null);
    only.appendChild(el("div", "kpi-sub", t("gender.onlyBreak", { m: g.onlyF.length, f: g.onlyM.length })));
    grid.appendChild(only);

    /* 2 — pares com diferença visual FORA de fantasia (a espécie em si tem
       ♂/♀ diferentes, tipo Frillish/Pyroar). "Faltam" inclui os dois jeitos
       de faltar (metade e nenhum); a distinção vira nota abaixo. */
    const missDiff = g.diffTotal - g.diffFull;
    grid.appendChild(mk("form", "#2e9c6c", t("gender.diffLabel"),
      g.diffFull, g.diffTotal, missDiff, missDiff ? () => GenderList.open("diff") : null));

    /* 3 — mesma pergunta, mas só entre fantasias (a diferença visual é da
       fantasia, tipo os pares de Pikachu de evento) — listas bem diferentes
       na prática, não faz sentido somar num número só. */
    const missDiffC = g.diffCTotal - g.diffCFull;
    grid.appendChild(mk("hat", "#2e9c6c", t("gender.diffCostumeLabel"),
      g.diffCFull, g.diffCTotal, missDiffC,
      missDiffC ? () => GenderList.open("diffCostume") : null));

    p.appendChild(grid);
    return p;
  },

  matrix(all, cats, label) {
    const p = el("div", "panel");
    p.appendChild(sectionHead(t("dash.matrix") + " · " + label, null, cats[0].color));

    const wrap = el("div", "tablewrap");
    const table = el("table", "matrix");

    const thead = el("thead");
    const hr = el("tr");
    hr.appendChild(el("th", null, t("dash.region")));
    for (const c of cats) {
      const th = el("th");
      const inn = el("div", "th-in");
      const sw = el("span", "swatch");
      sw.style.background = c.color;
      inn.append(sw, el("span", null, catShort(c)));
      th.appendChild(inn);
      th.title = catLabel(c);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const r of Agg.skeleton.regions) {
      /* Região sem nada lançado em NENHUMA coluna desta tabela (ex.: Gen 10
         inteira, ou Hisui em Formas especiais) some — reaparece sozinha no
         dia em que alguma entrada de lá ganhar uma data de estreia. */
      const rowStats = cats.map(c => all[c.key].byRegion[r]);
      if (!rowStats.some(s => s && s.released > 0)) continue;
      const tr = el("tr");
      tr.appendChild(el("td", null, regionLabel(r)));
      for (const c of cats) tr.appendChild(this.cell(all[c.key].byRegion[r], c, r));
      tbody.appendChild(tr);
    }
    const tr = el("tr", "total-row");
    tr.appendChild(el("td", null, t("dash.total")));
    for (const c of cats) tr.appendChild(this.cell(all[c.key].total, c, null));
    tbody.appendChild(tr);

    table.appendChild(tbody);
    wrap.appendChild(table);
    p.appendChild(wrap);
    return p;
  },

  cell(s, cat, region) {
    const td = el("td");
    /* "–" quando nada dessa região ainda foi lançado nesta categoria —
       não só quando não existe na planilha. Um "0" aqui insinuava que
       dava pra progredir; se ainda nem lançou, não dá. */
    if (!s || !s.released) { td.appendChild(el("span", "cell empty", "–")); return td; }
    const done = s.caught >= s.released && s.released > 0;
    const d = el("div", "cell" + (done ? " done" : ""));
    d.style.setProperty("--c", cat.color);
    d.append(el("b", null, String(s.caught)));
    const mb = el("div", "minibar");
    const i = el("i");
    i.style.width = pct(s.caught, s.released) + "%";
    mb.appendChild(i);
    d.appendChild(mb);
    td.title = `${catLabel(cat)}${region ? " · " + regionLabel(region) : ""}\n` +
      `${s.caught} / ${s.released} (${pct(s.caught, s.released)}%)\n` +
      `${t("dash.total")}: ${s.total}`;
    td.appendChild(d);
    return td;
  }
};

/* ============================================================ FALTANTES */
const Lists = {
  state: { cat: "pokemon", region: "", q: "", showUnreleased: false, showRegistered: false, includePreEvo: false },

  render(root, params) {
    if (params && params.cat) this.state.cat = params.cat;
    const cat = Agg.byCat[this.state.cat];

    const p = el("div", "panel");
    p.style.setProperty("--c", cat.color);
    const h = el("h2");
    h.append(Icons.badge(cat, 22), el("span", null, t("lists.title")));
    h.style.color = cat.color;
    p.append(h, el("p", "sub", t("lists.sub")));

    const controls = el("div", "row");
    const catSel = el("select");
    for (const g of ["dex", "special", "variant"]) {
      const og = document.createElement("optgroup");
      og.label = t("dash.group" + g.charAt(0).toUpperCase() + g.slice(1));
      for (const c of Agg.categories.filter(x => x.group === g)) {
        const o = el("option", null, catLabel(c));
        o.value = c.key;
        if (c.key === this.state.cat) o.selected = true;
        og.appendChild(o);
      }
      catSel.appendChild(og);
    }
    catSel.setAttribute("aria-label", t("lists.category"));
    catSel.addEventListener("change", () => { this.state.cat = catSel.value; App.rerender(); });

    const regSel = el("select");
    const optAll = el("option", null, t("lists.all")); optAll.value = "";
    regSel.appendChild(optAll);
    for (const r of Agg.skeleton.regions) {
      const o = el("option", null, regionLabel(r)); o.value = r;
      if (r === this.state.region) o.selected = true;
      regSel.appendChild(o);
    }
    regSel.setAttribute("aria-label", t("lists.region"));
    regSel.addEventListener("change", () => { this.state.region = regSel.value; App.rerender(); });

    const q = el("input");
    q.type = "search"; q.placeholder = t("lists.search"); q.value = this.state.q;
    q.addEventListener("input", () => { this.state.q = q.value; this.paint(body); });

    const unrel = el("button", "chip" + (this.state.showUnreleased ? " is-on" : ""));
    unrel.append(el("span", null, t("lists.showUnreleased")));
    unrel.addEventListener("click", () => {
      this.state.showUnreleased = !this.state.showUnreleased; App.rerender();
    });

    /* pra navegar os sprites de uma categoria já completa — sem isso, clicar
       num card 100% só mostrava "Completo!" e nada pra ver. */
    const showReg = el("button", "chip" + (this.state.showRegistered ? " is-on" : ""));
    showReg.append(el("span", null, t("lists.showRegistered")));
    showReg.addEventListener("click", () => {
      this.state.showRegistered = !this.state.showRegistered; App.rerender();
    });

    const preEvo = el("button", "chip" + (this.state.includePreEvo ? " is-on" : ""));
    preEvo.append(el("span", null, t("lists.includePreEvo")));
    preEvo.addEventListener("click", () => {
      this.state.includePreEvo = !this.state.includePreEvo; App.rerender();
    });

    controls.append(catSel, regSel, q, unrel, showReg, preEvo);
    p.appendChild(controls);

    const body = el("div");
    p.appendChild(body);
    this.paint(body);
    root.appendChild(p);
  },

  paint(body) {
    body.textContent = "";
    const cat = Agg.byCat[this.state.cat];
    const region = this.state.region || null;
    const qq = this.state.q.trim().toLowerCase();
    const filt = list => !qq ? list : list.filter(it =>
      nameOf(it.display).toLowerCase().includes(qq) ||
      speciesOf(it.display).toLowerCase().includes(qq) ||
      String(it.num).includes(qq));

    if (Store.isEmpty()) {
      const e = el("div", "empty-state");
      e.append(Icons.svg("upload", 38), el("div", null, t("lists.needData")));
      const b = el("button", "btn primary");
      b.style.marginTop = "12px";
      b.append(Icons.svg("upload", 15), el("span", null, t("banner.cta")));
      b.addEventListener("click", () => App.go("data"));
      e.appendChild(b);
      body.appendChild(e);
      return;
    }

    const split = Agg.missingSplit(this.state.cat, region);
    const todo = filt(split.todo);
    const blocked = filt(split.blocked);

    /* string de busca do jogo — só o que dá pra caçar agora */
    const searchStr = Agg.searchString(this.state.cat, region, this.state.includePreEvo);
    if (searchStr) {
      const box = el("div", "busca");
      const left = el("div");
      left.style.flex = "1";
      left.append(el("div", "small dim", t("lists.busca")), el("code", null, searchStr));
      if (this.state.includePreEvo) {
        let note = t("lists.includePreEvoNote");
        if (cat.mark === "xxl" || cat.mark === "xxs") note += t("lists.includePreEvoNoteSize");
        left.appendChild(el("div", "small dim", note));
      }
      const copy = el("button", "btn");
      copy.append(Icons.svg("copy", 15), el("span", null, t("lists.copy")));
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(searchStr); }
        catch (err) {
          const ta = el("textarea"); ta.value = searchStr;
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
        }
        toast(t("lists.copied"));
      });
      box.append(left, copy);
      body.appendChild(box);
    }

    if (!todo.length) {
      const e = el("div", "empty-state");
      e.append(Icons.svg("check", 38), el("div", null, t("lists.done")),
               el("div", "small dim", t("lists.doneSub")));
      body.appendChild(e);
    } else {
      body.appendChild(el("div", "small dim", t("lists.count", { n: todo.length })));
      body.appendChild(el("div", "small dim",
        t("lists.tapHint", { mark: t("e." + cat.mark).toLowerCase() })));
      body.appendChild(this.grid(todo, cat, false));
    }

    /* bloqueados: falta o registro base primeiro */
    if (blocked.length) {
      const h = el("div", "small dim");
      h.style.marginTop = "18px";
      h.textContent = t("lists.blocked", { n: blocked.length });
      body.append(h, this.grid(blocked, cat, false, true));
    }

    if (this.state.showUnreleased) {
      const un = filt(Agg.unreleased(this.state.cat, region));
      if (un.length) {
        const h = el("div", "small dim");
        h.style.marginTop = "18px";
        h.textContent = t("lists.unreleasedCount", { n: un.length });
        body.append(h, this.grid(un, cat, true));
      }
    }

    if (this.state.showRegistered) {
      const reg = filt(Agg.registered(this.state.cat, region));
      if (reg.length) {
        const h = el("div", "small dim");
        h.style.marginTop = "18px";
        h.textContent = t("lists.registeredCount", { n: reg.length });
        body.append(h, this.grid(reg, cat, false));
      }
    }
  },

  grid(items, cat, unreleased, dim) {
    const shinyLook = /shiny|Shiny/.test(cat.key) || cat.key === "shiny";
    return pagedGrid(items, it => monCard(it, cat, {
      shiny: shinyLook, unreleased, dim, quick: !unreleased
    }));
  }
};

/* card de Pokémon reaproveitado em todas as telas */
function monCard(it, cat, opt) {
  opt = opt || {};
  const card = el("div", "mon" + (opt.unreleased ? " unreleased" : ""));
  if (opt.dim) card.style.opacity = ".72";
  card.appendChild(el("span", "dexno", String(it.num).padStart(4, "0")));
  card.appendChild(Sprites.img(it.display, !!opt.shiny));
  card.appendChild(el("div", "nm", labelFor(it, cat)));

  /* marcação rápida: um toque marca sem abrir a ficha */
  if (opt.quick && cat && !Store.isEmpty()) {
    const target = cat.scope === "dex"
      ? Agg.baseEntry(it.num, it.entries) : it.entries[0];
    const q = el("button", "quick" + (Store.has(target.id, cat.mark) ? " on" : ""));
    q.type = "button";
    q.title = t("lists.quickTip", { mark: t("e." + cat.mark) });
    q.appendChild(Icons.svg("check", 14));
    q.addEventListener("click", ev => {
      ev.stopPropagation();
      const on = Store.toggle(target.id, cat.mark);
      q.classList.toggle("on", on);
      card.classList.toggle("got", on);
      /* De propósito NÃO re-renderiza a tela: marcar 20 seguidos ficava
         reconstruindo o DOM inteiro 20 vezes (e perdendo o scroll). O card
         só ganha a borda verde; os números atualizam na próxima visita. */
      App.markDirty();
    });
    card.appendChild(q);
  }

  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const open = () => Detail.openEntry(it.display, it.entries);
  card.addEventListener("click", open);
  card.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
  return card;
}

/* ========================================================= LINHA DO TEMPO */
const Timeline = {
  state: { gate: "base", onlyMissing: false, showCostumes: false, sel: null },
  MONTHS: {
    pt: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  },
  GATE_COLOR: {
    base: "#1E9BD7", shiny: "#E0A21B", shadow: "#7A4CC0",
    shadowShiny: "#9B55CC", dmax: "#C6317B", dmaxShiny: "#DB5397"
  },

  render(root) {
    const color = this.GATE_COLOR[this.state.gate] || "#1E9BD7";
    const p = el("div", "panel");
    p.style.setProperty("--c", color);
    const h = el("h2");
    h.append(Icons.svg("calendar", 18), el("span", null, t("tl.title")));
    p.append(h, el("p", "sub", t("tl.sub")));

    const controls = el("div", "row");
    const chips = el("div", "chips");
    for (const g of Agg.skeleton.dateKeys) {
      const c = el("button", "chip" + (g === this.state.gate ? " is-on" : ""));
      if (g === this.state.gate) {
        c.style.background = color;
        c.style.borderColor = color;
      }
      c.textContent = t("tl." + g);
      c.addEventListener("click", () => { this.state.gate = g; App.rerender(); });
      chips.appendChild(c);
    }
    controls.appendChild(chips);
    controls.appendChild(el("span", "spacer"));

    if (!Store.isEmpty()) {
      const om = el("button", "chip" + (this.state.onlyMissing ? " is-on" : ""),
                    t("tl.onlyMissing"));
      om.addEventListener("click", () => {
        this.state.onlyMissing = !this.state.onlyMissing; App.rerender();
      });
      controls.appendChild(om);
    }
    const cc = el("button", "chip" + (this.state.showCostumes ? " is-on" : ""),
                  t("tl.showCostumes"));
    cc.addEventListener("click", () => {
      this.state.showCostumes = !this.state.showCostumes; App.rerender();
    });
    controls.appendChild(cc);
    p.appendChild(controls);

    const map = Agg.debutsByDate(this.state.gate, this.state.onlyMissing, this.state.showCostumes);
    let maxN = 1;
    for (const [, arr] of map) if (arr.length > maxN) maxN = arr.length;

    const years = [];
    for (const [d] of map) { const y = +d.slice(0, 4); if (years.indexOf(y) === -1) years.push(y); }
    years.sort((a, b) => b - a);

    if (!years.length) {
      p.appendChild(el("div", "empty-state", t("tl.nothing")));
      root.appendChild(p);
      root.appendChild(this.seeAlso());
      return;
    }

    const holder = el("div");
    holder.style.setProperty("--c", color);
    for (const y of years) holder.appendChild(this.year(y, map, maxN));
    p.appendChild(holder);

    const lg = el("div", "legend");
    lg.style.marginTop = "6px";
    lg.style.setProperty("--c", color);
    lg.append(el("span", null, t("tl.less")));
    for (const c of ["", "l1", "l2", "l3", "l4"]) lg.appendChild(el("span", "day " + c));
    lg.append(el("span", null, t("tl.more")));
    p.appendChild(lg);

    root.appendChild(p);
    root.appendChild(this.seeAlso());
  },

  /* Outros dois sites do Gabrielense — atalhos discretos no fim da aba. */
  seeAlso() {
    const p = el("div", "panel");
    p.appendChild(sectionHead(t("tl.seeAlso"), null, "#8659C5"));
    const grid = el("div", "sitecards");
    const sites = [
      { url: "https://pogorewind.vercel.app", icon: "gallery", name: "PogoRewind",
        desc: t("tl.pogorewindDesc") },
      { url: "https://pikachugo.vercel.app", icon: "bolt", name: "PikachuGO",
        desc: t("tl.pikachugoDesc") }
    ];
    for (const s of sites) {
      const a = el("a", "sitecard");
      a.href = s.url; a.target = "_blank"; a.rel = "noopener";
      a.appendChild(Icons.svg(s.icon, 22));
      const info = el("div");
      info.append(el("div", "sitecard-name", s.name), el("div", "small dim", s.desc));
      a.appendChild(info);
      grid.appendChild(a);
    }
    p.appendChild(grid);
    return p;
  },

  year(y, map, maxN) {
    const box = el("div", "year");
    let total = 0;
    for (const [d, a] of map) if (d.slice(0, 4) === String(y)) total += a.length;

    const head = el("div", "year-head");
    head.append(el("b", null, String(y)),
                el("span", null, t("tl.yearTotal", { n: total, y })));
    box.appendChild(head);

    const strip = el("div", "strip");
    const months = this.MONTHS[LANG] || this.MONTHS.pt;
    for (let m = 0; m < 12; m++) {
      const mb = el("div", "month");
      mb.appendChild(el("div", "month-lbl", months[m]));
      const days = el("div", "days");
      const first = new Date(Date.UTC(y, m, 1));
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let pad = 0; pad < first.getUTCDay(); pad++) {
        const s = el("span", "day");
        s.style.visibility = "hidden";
        days.appendChild(s);
      }
      for (let d = 1; d <= dim; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const arr = map.get(iso);
        const n = arr ? arr.length : 0;
        const lvl = !n ? "" : n >= maxN * .6 ? "l4" : n >= maxN * .3 ? "l3" : n >= 3 ? "l2" : "l1";
        const b = el("button", "day " + lvl + (this.state.sel === iso ? " sel" : ""));
        b.type = "button";
        if (n) {
          b.dataset.n = n;
          b.title = fmtDate(iso) + " · " + (n === 1 ? t("tl.debut1") : t("tl.debuts", { n }));
          b.addEventListener("click", () => {
            this.state.sel = iso;
            DayPanel.open(iso, arr, this.state.gate);
          });
        } else {
          b.title = fmtDate(iso);
          b.disabled = true;
        }
        days.appendChild(b);
      }
      mb.appendChild(days);
      strip.appendChild(mb);
    }
    box.appendChild(strip);
    return box;
  }
};

/* =========================================================== painel modal */
function openSheet(build) {
  closeSheet();
  const scrim = el("div", "scrim");
  scrim.id = "scrim";
  scrim.addEventListener("click", closeSheet);
  const sheet = el("div", "sheet");
  sheet.id = "sheet";
  build(sheet);
  document.body.append(scrim, sheet);
  document.addEventListener("keydown", escClose);
}
function closeSheet() {
  const s = document.getElementById("sheet"), c = document.getElementById("scrim");
  if (s) s.remove();
  if (c) c.remove();
  document.removeEventListener("keydown", escClose);
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }

function sheetHead(sheet, title, color) {
  if (color) sheet.style.borderTopColor = color;
  const h = el("div", "sheet-head");
  h.appendChild(el("h3", null, title));
  const x = el("button", "sheet-x", "×");
  x.setAttribute("aria-label", "fechar");
  x.addEventListener("click", closeSheet);
  h.appendChild(x);
  sheet.appendChild(h);
}

const DayPanel = {
  open(iso, entries, gate) {
    openSheet(sheet => {
      sheetHead(sheet, fmtDate(iso) + " · " + t("tl." + gate),
                Timeline.GATE_COLOR[gate]);
      sheet.appendChild(el("div", "small dim",
        entries.length === 1 ? t("tl.debut1") : t("tl.debuts", { n: entries.length })));
      const g = el("div", "grid");
      g.style.marginTop = "10px";
      const shiny = gate.indexOf("hiny") !== -1 || gate === "shiny";
      const mk = GATE_MARK[gate];
      for (const e of entries.slice().sort((a, b) => a.num - b.num)) {
        const card = el("div", "mon");
        card.appendChild(el("span", "dexno", String(e.num).padStart(4, "0")));
        card.appendChild(Sprites.img(e, shiny));
        card.appendChild(el("div", "nm", nameOf(e)));
        if (mk && Store.has(e.id, mk)) card.classList.add("got");
        card.addEventListener("click", () => Detail.openEntry(e));
        g.appendChild(card);
      }
      sheet.appendChild(g);
    });
  }
};

/* listas de gênero abertas pelos cards do painel */
const GenderList = {
  open(kind) {
    const g = Agg.genderStats();
    openSheet(sheet => {
      let items, title, note;
      if (kind === "only") {
        items = g.onlyM.concat(g.onlyF);
        title = t("gender.dexLabel");
        note = t("gender.onlyBreak", { m: g.onlyF.length, f: g.onlyM.length });
      } else if (kind === "diff") {
        items = g.diffHalf.concat(g.diffNone);
        title = t("gender.diffLabel");
        const parts = [];
        if (g.diffHalf.length) parts.push(t("gender.halfCount", { n: g.diffHalf.length }));
        if (g.diffNone.length) parts.push(t("gender.noneNote", { n: g.diffNone.length }));
        note = parts.join(" · ");
      } else {
        items = g.diffCHalf.concat(g.diffCNone);
        title = t("gender.diffCostumeLabel");
        const parts = [];
        if (g.diffCHalf.length) parts.push(t("gender.halfCount", { n: g.diffCHalf.length }));
        if (g.diffCNone.length) parts.push(t("gender.noneNote", { n: g.diffCNone.length }));
        note = parts.join(" · ");
      }
      sheetHead(sheet, title, "#7c5cd6");
      sheet.appendChild(el("div", "small dim", note));

      if (!items.length) {
        sheet.appendChild(el("div", "empty-state", t("dash.complete")));
        return;
      }
      const grid = el("div", "grid");
      grid.style.marginTop = "10px";
      for (const it of items) {
        const card = el("div", "mon");
        card.appendChild(el("span", "dexno", String(it.num).padStart(4, "0")));
        card.appendChild(Sprites.img(it.display, false));
        card.appendChild(el("div", "nm", speciesOf(it.display)));

        /* mostra exatamente o que falta */
        let txt, both = false;
        if (it.missingEntries) {
          both = it.missingEntries.length === it.entries.length;
          txt = both ? t("gender.tagNeither")
                     : t("gender.tagMissing",
                         { g: it.missingEntries.map(e => e.gender || "?").join(" ") });
        } else if (it.hasM && !it.hasF) txt = t("gender.tagMissing", { g: "♀" });
        else if (it.hasF && !it.hasM) txt = t("gender.tagMissing", { g: "♂" });
        else { txt = t("gender.tagNeither"); both = true; }
        const tag = el("div", "small");
        tag.style.cssText = "font-weight:700;font-size:11px;color:" +
          (both ? "var(--faint)" : "var(--miss)");
        tag.textContent = txt;
        card.appendChild(tag);

        card.addEventListener("click", () => Detail.openEntry(it.display, it.entries));
        grid.appendChild(card);
      }
      sheet.appendChild(grid);
    });
  }
};

/* ============================================================ LIVING DEX */
/* Atributos combináveis das dexes personalizadas + cor/ícone de cada um */
const CUSTOM_PARTS = [
  ["shiny", "sparkle", "#E0A21B"], ["lucky", "clover", "#EE7B22"],
  ["shadow", "flame", "#7A4CC0"], ["purified", "purify", "#22AEBC"],
  ["dmax", "dmax", "#C6317B"], ["perfect", "star", "#E14B62"],
  ["xxl", "xxl", "#3A6FB0"], ["xxs", "xxs", "#8659C5"]
];
const PART_LABEL = k => ({
  shiny: t("tl.shiny"), lucky: t("e.lucky"), shadow: t("tl.shadow"),
  purified: t("e.purified"), dmax: t("tl.dmax"), perfect: t("e.perfect"),
  xxl: "XXL", xxs: "XXS"
}[k] || k);

/* def salva -> objeto de exibição no formato dos tiers embutidos */
function customTierView(def) {
  const first = CUSTOM_PARTS.find(([k]) => def.parts[k]);
  const bits = Object.keys(def.parts).filter(k => def.parts[k]).map(PART_LABEL);
  if (def.gender) bits.push(def.gender === "f" ? "♀" : "♂");
  return {
    key: def.id, custom: true, def,
    scope: "dex", mark: null,
    color: first ? first[2] : "#7c5cd6",
    icon: first ? first[1] : (def.gender === "f" ? "female" : "male"),
    label: bits.join(" + ") || "?"
  };
}

const Living = {
  state: { tier: "regular", region: "", builder: null },

  render(root) {
    const tiers = Agg.livingTiers();
    const customs = Store.customTiers.map(customTierView);
    const on = Agg.enabledLivingTiers();
    const validTier = on.has(this.state.tier) ||
      customs.some(c => c.key === this.state.tier);
    if (!validTier) this.state.tier = "regular";

    /* --- painel 1: o que é + camadas ligadas --- */
    const p1 = el("div", "panel");
    const h = el("h2");
    h.append(Icons.svg("ball", 18), el("span", null, t("living.title")));
    p1.append(h, el("p", "sub", t("living.sub")));

    const chips = el("div", "chips");
    for (const tier of tiers) {
      const enabled = on.has(tier.key);
      const c = el("button", "chip" + (enabled ? " is-on" : ""));
      if (enabled) { c.style.background = tier.color; c.style.borderColor = tier.color; }
      c.append(Icons.badge(tier, 17), el("span", null, t("living." + tier.key)));
      if (tier.locked) {
        c.title = t("living.alwaysOn");
      } else {
        c.addEventListener("click", () => {
          const cur = new Set(Agg.enabledLivingTiers());
          if (cur.has(tier.key)) cur.delete(tier.key); else cur.add(tier.key);
          Store.prefs.livingTiers = Array.from(cur);
          Store.savePrefs();
          App.rerender();
        });
      }
      chips.appendChild(c);
    }
    /* dexes personalizadas: chip colorido com × pra remover */
    for (const cv of customs) {
      const c = el("button", "chip is-on");
      c.style.background = cv.color;
      c.style.borderColor = cv.color;
      c.append(Icons.badge(cv, 17), el("span", null, cv.label));
      const x = el("span", null, " ×");
      x.style.cssText = "font-weight:800;opacity:.75";
      c.appendChild(x);
      c.title = t("living.removeCustom");
      c.addEventListener("click", () => {
        if (confirm(t("living.removeConfirm", { name: cv.label }))) {
          Store.removeCustomTier(cv.key);
          if (this.state.tier === cv.key) this.state.tier = "regular";
          App.rerender();
        }
      });
      chips.appendChild(c);
    }
    p1.appendChild(chips);
    p1.appendChild(el("p", "small dim", t("living.tiersHint")));
    if (!Store.isEmpty()) p1.appendChild(this.builder());
    root.appendChild(p1);

    if (Store.isEmpty()) {
      const e = el("div", "panel empty-state");
      e.append(Icons.svg("upload", 38), el("div", null, t("lists.needData")));
      root.appendChild(e);
      return;
    }

    /* --- painel 2: progresso por camada ligada + personalizadas --- */
    const p2 = el("div", "panel");
    p2.appendChild(sectionHead(t("living.progress"), null, "#1E9BD7"));
    const grid = el("div", "kpis");
    let sumC = 0, sumR = 0;
    for (const tier of tiers) {
      if (!on.has(tier.key)) continue;
      const s = Agg.livingStats(tier.key);
      sumC += s.caught; sumR += s.released;
      grid.appendChild(this.card(tier, s));
    }
    for (const cv of customs) {
      const s = Agg.livingStats(cv.key);
      sumC += s.caught; sumR += s.released;
      grid.appendChild(this.card(cv, s));
    }
    p2.appendChild(grid);
    p2.appendChild(el("p", "small dim",
      t("living.grandTotal", { c: sumC, n: sumR })));
    root.appendChild(p2);

    /* --- painel 3: faltantes da camada selecionada --- */
    const tier = tiers.find(x => x.key === this.state.tier) ||
                 customs.find(x => x.key === this.state.tier);
    const s = Agg.livingStats(tier.key);
    const missing = s.items.filter(it =>
      it.released && !it.got && (!this.state.region || it.region === this.state.region));

    const tierName = tier.custom ? tier.label : t("living." + tier.key);
    const p3 = el("div", "panel");
    p3.style.setProperty("--c", tier.color);
    p3.appendChild(sectionHead(
      t("living.missingIn") + " · " + tierName, missing.length, tier.color));

    const controls = el("div", "row");
    const regSel = el("select");
    const optAll = el("option", null, t("lists.all")); optAll.value = "";
    regSel.appendChild(optAll);
    for (const r of Agg.skeleton.regions) {
      const o = el("option", null, regionLabel(r)); o.value = r;
      if (r === this.state.region) o.selected = true;
      regSel.appendChild(o);
    }
    regSel.addEventListener("change", () => {
      this.state.region = regSel.value; App.rerender();
    });
    controls.appendChild(regSel);
    p3.appendChild(controls);

    /* busca por números, como nas outras listas */
    const busca = Agg.numberString(missing);
    if (busca) {
      const box = el("div", "busca");
      const left = el("div");
      left.style.flex = "1";
      left.append(el("div", "small dim", t("lists.busca")), el("code", null, busca));
      const copy = el("button", "btn");
      copy.append(Icons.svg("copy", 15), el("span", null, t("lists.copy")));
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(busca); } catch (err) { /* fallback abaixo */
          const ta = el("textarea"); ta.value = busca;
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
        }
        toast(t("lists.copied"));
      });
      box.append(left, copy);
      p3.appendChild(box);
    }

    if (!missing.length) {
      const e = el("div", "empty-state");
      e.append(Icons.svg("check", 38), el("div", null, t("lists.done")));
      p3.appendChild(e);
    } else {
      p3.appendChild(el("div", "small dim", t("living.tapHint")));
      const pseudoCat = { scope: tier.scope, mark: tier.mark, key: tier.key };
      const shinyLook = tier.mark === "livingShiny" ||
                        (tier.custom && tier.def.parts.shiny);
      p3.appendChild(pagedGrid(missing, it => {
        const card = el("div", "mon");
        card.appendChild(el("span", "dexno", String(it.num).padStart(4, "0")));
        card.appendChild(Sprites.img(it.display, shinyLook));
        card.appendChild(el("div", "nm", labelFor(it, pseudoCat)));
        /* se está registrado mas não vivo, mostra — é o caso clássico */
        if (it.entries.some(e2 => Store.has(e2.id, "caught"))) {
          const tag = el("div", "small");
          tag.style.cssText = "font-size:10.5px;color:var(--warn);font-weight:600";
          tag.textContent = t("living.haveRegistered");
          card.appendChild(tag);
        }
        const q = el("button", "quick");
        q.type = "button";
        q.title = t("lists.quickTip",
          { mark: tier.custom ? tierName : t("e." + tier.mark) });
        q.appendChild(Icons.svg("check", 14));
        q.addEventListener("click", ev => {
          ev.stopPropagation();
          const nowOn = tier.custom
            ? Store.customToggle(tier.key, it.num)
            : Store.toggle(it.target.id, tier.mark);
          q.classList.toggle("on", nowOn);
          card.classList.toggle("got", nowOn);
          App.markDirty();   // sem re-render: ver comentário em monCard
        });
        card.appendChild(q);
        card.addEventListener("click", () => Detail.openEntry(it.display, it.entries));
        return card;
      }));
    }
    root.appendChild(p3);
  },

  /* formulário compacto: monta uma dex personalizada de atributos + gênero */
  builder() {
    if (!this.state.builder) this.state.builder = { parts: {}, gender: "" };
    const st = this.state.builder;
    const box = el("div", "custom-builder");
    box.appendChild(el("div", "small dim", t("living.customTitle")));
    const row = el("div", "row");
    for (const [key, icon, color] of CUSTOM_PARTS) {
      const c = el("button", "chip" + (st.parts[key] ? " is-on" : ""));
      if (st.parts[key]) { c.style.background = color; c.style.borderColor = color; }
      c.append(Icons.svg(icon, 13), el("span", null, PART_LABEL(key)));
      c.addEventListener("click", () => {
        st.parts[key] = !st.parts[key];
        App.rerender();
      });
      row.appendChild(c);
    }
    const gsel = el("select");
    for (const [v, lbl] of [["", t("living.anyGender")], ["m", "♂"], ["f", "♀"]]) {
      const o = el("option", null, lbl); o.value = v;
      if (st.gender === v) o.selected = true;
      gsel.appendChild(o);
    }
    gsel.addEventListener("change", () => { st.gender = gsel.value; });
    row.appendChild(gsel);

    const add = el("button", "btn primary");
    add.append(Icons.svg("check", 14), el("span", null, t("living.customAdd")));
    add.addEventListener("click", () => {
      const parts = {};
      for (const k in st.parts) if (st.parts[k]) parts[k] = true;
      if (!Object.keys(parts).length && !st.gender) {
        toast(t("living.customEmpty"));
        return;
      }
      const id = Store.addCustomTier({ parts, gender: st.gender });
      this.state.builder = null;
      this.state.tier = id;
      App.rerender();
    });
    row.appendChild(add);
    box.appendChild(row);
    box.appendChild(el("div", "small dim", t("living.customHint")));
    return box;
  },

  card(tier, s) {
    const b = el("button", "kpi" + (this.state.tier === tier.key ? " done" : ""));
    b.type = "button";
    b.style.setProperty("--c", tier.color);
    if (this.state.tier === tier.key) b.style.borderColor = tier.color;
    const top = el("div", "kpi-top");
    top.append(Icons.badge(tier, 22),
      el("span", "kpi-name", tier.custom ? tier.label : t("living." + tier.key)));
    const num = el("div", "kpi-num");
    num.append(document.createTextNode(String(s.caught)),
               el("span", "of", " / " + s.released));
    const bar = el("div", "bar");
    const fill = el("i");
    const p = pct(s.caught, s.released);
    fill.style.width = p + "%";
    if (p >= 100) fill.className = "full";
    bar.appendChild(fill);
    const miss = s.released - s.caught;
    const sub = el("div", "kpi-sub");
    sub.append(el("span", null, p + "%"),
      el("span", "kpi-miss" + (miss <= 0 ? " zero" : ""),
         miss <= 0 ? t("dash.complete") : missingLabel(miss)));
    b.append(top, num, bar, sub);
    b.addEventListener("click", () => { this.state.tier = tier.key; App.rerender(); });
    return b;
  }
};

/* =========================================================== BACKGROUNDS
   Sem marca propria: "tenho este background" e derivado da marca "caught"
   de sempre (ver Agg.backgroundStats/backgroundItems). Especiais primeiro
   e por padrao - presenciais ficam numa sub-aba a parte porque a imensa
   maioria e impossivel de completar sem ter ido ao evento (PLANS.md). */
const Backgrounds = {
  state: { tab: "special" },

  render(root) {
    if (!Agg.backgrounds || !Agg.backgrounds.length) {
      const e = el("div", "panel empty-state");
      e.append(Icons.svg("gallery", 38), el("div", null, t("bg.unavailable")));
      root.appendChild(e);
      return;
    }

    const p1 = el("div", "panel");
    p1.append(el("h2", null, t("bg.title")), el("p", "sub", t("bg.sub")));
    const summary = el("div", "kpis");
    summary.append(this.summaryCard("special", "sparkle", "#E0A21B"),
                   this.summaryCard("location", "globe", "#3A6FB0"));
    p1.appendChild(summary);
    root.appendChild(p1);

    const p2 = el("div", "panel");
    const chips = el("div", "chips");
    for (const [key, icon] of [["special", "sparkle"], ["location", "globe"]]) {
      const c = el("button", "chip" + (this.state.tab === key ? " is-on" : ""));
      c.append(Icons.svg(icon, 14), el("span", null, t("bg." + key)));
      c.addEventListener("click", () => { this.state.tab = key; App.rerender(); });
      chips.appendChild(c);
    }
    p2.appendChild(chips);

    const items = Agg.backgroundItems(this.state.tab);
    if (this.state.tab === "location") {
      p2.appendChild(el("p", "small dim", t("bg.locationNote")));
    }
    p2.appendChild(el("p", "small dim", t("bg.count", { n: items.length })));
    if (!Store.isEmpty()) p2.appendChild(el("p", "small dim", t("bg.tapHint")));

    if (!items.length) {
      p2.appendChild(el("div", "empty-state", t("bg.noneYet")));
    } else {
      const grid = el("div", "bg-grid");
      for (const b of items) grid.appendChild(this.card(b));
      p2.appendChild(grid);
    }
    root.appendChild(p2);
  },

  summaryCard(type, icon, color) {
    const s = Agg.backgroundStats(type);
    const b = el("div", "kpi noclick");
    b.style.setProperty("--c", color);
    const top = el("div", "kpi-top");
    top.append(Icons.svg(icon, 20), el("span", "kpi-name", t("bg." + type)));
    const num = el("div", "kpi-num");
    num.append(document.createTextNode(String(s.bgOwned)), el("span", "of", " / " + s.bgTotal));
    const bar = el("div", "bar");
    const fill = el("i");
    const p = pct(s.bgOwned, s.bgTotal);
    fill.style.width = p + "%";
    if (p >= 100) fill.className = "full";
    bar.appendChild(fill);
    const sub = el("div", "kpi-sub");
    sub.append(el("span", null, p + "%"),
      el("span", "dim", t("bg.pokemonCount", { c: s.pkmnOwned, n: s.pkmnTotal })));
    b.append(top, num, bar, sub);
    return b;
  },

  card(bg) {
    const card = el("div", "bg-card" + (bg.caught === 0 ? " is-empty" : ""));
    const banner = el("div", "bg-banner");
    banner.style.backgroundImage = `url("${bg.image}")`;
    card.appendChild(banner);

    const allCaught = bg.pokemon.length > 0 && bg.caught === bg.pokemon.length;
    const progress = el("div", "bg-progress" + (allCaught ? " done" : ""),
      `${bg.caught} / ${bg.pokemon.length}`);
    const info = el("div", "bg-info");
    info.append(el("div", "bg-name", bg.name), progress);
    card.appendChild(info);

    if (bg.events && bg.events.length) {
      card.appendChild(el("div", "small dim bg-events", bg.events.join(" · ")));
    }

    const canMark = !Store.isEmpty();
    const sprites = el("div", "bg-sprites");
    for (const p of bg.pokemon) {
      const entry = Agg.byId.get(p.id);
      if (!entry) continue;
      const got = Store.hasBackgroundMark(bg.id, p.id);
      const s = el("div", "bg-sprite" + (got ? " got" : ""));
      s.title = nameOf(entry) + (p.viaEvolution ? " (" + t("bg.viaEvolution") + ")" : "") +
        (canMark ? " — " + t("bg.tapHint") : "");
      s.appendChild(Sprites.img(entry, false));
      /* marcacao rapida: clique liga/desliga o par (background, Pokemon) -
         mesmo espirito do botao ✓ quick nas outras telas. De propósito NÃO
         reconstroi o card inteiro, só o que mudou (ver monCard). */
      if (canMark) {
        s.setAttribute("role", "button");
        s.tabIndex = 0;
        const toggle = () => {
          const on = Store.toggleBackgroundMark(bg.id, p.id);
          s.classList.toggle("got", on);
          const nowCaught = bg.pokemon.filter(pp => Store.hasBackgroundMark(bg.id, pp.id)).length;
          bg.caught = nowCaught;
          progress.textContent = `${nowCaught} / ${bg.pokemon.length}`;
          progress.classList.toggle("done", nowCaught === bg.pokemon.length);
          card.classList.toggle("is-empty", nowCaught === 0);
          App.markDirty();
        };
        s.addEventListener("click", toggle);
        s.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
      }
      sprites.appendChild(s);
    }
    card.appendChild(sprites);
    return card;
  }
};

/* ============================================================= ficha */
const MARK_GATE = {
  caught: "base", shiny: "shiny", shinyDex: "shiny", shadow: "shadow",
  purified: "shadow", shadowShiny: "shadowShiny", dmax: "dmax",
  dmaxShiny: "dmaxShiny", xxs: "base", xxl: "base", lucky: "base",
  perfect: "base", m: "base", n: "base", f: "base",
  living: "base", livingShiny: "shiny", livingShadow: "shadow",
  livingPurified: "shadow", livingDmax: "dmax", livingLucky: "base"
};
/* na ficha, as marcas de registro e as de living dex ficam em blocos separados */
const REGISTER_MARKS = MARK_ORDER.filter(k => k.indexOf("living") !== 0);
const LIVING_MARKS = MARK_ORDER.filter(k => k.indexOf("living") === 0);

const Detail = {
  openEntry(entry, siblings) {
    openSheet(sheet => {
      sheetHead(sheet, nameOf(entry));
      const d = el("div", "detail");
      d.appendChild(Sprites.img(entry, false));

      const right = el("div", "detail-side");
      const hint = el("div", "small dim");
      hint.style.marginBottom = "7px";
      hint.textContent = Store.isEmpty() ? t("e.readonly") : t("e.editHint");
      right.appendChild(hint);

      const allowed = Agg.allowedGenders(entry);
      const markGrid = keys => {
        const marks = el("div", "marks");
        for (const k of keys) {
          const gate = MARK_GATE[k] || "base";
          const on = Store.has(entry.id, k);
          let locked = !Agg.released(entry, gate);
          let lockWhy = t("e.notReleased");
          /* gênero impossível fica travado (Bulbasaur nunca é ⚲; Magnemite
             nunca é ♂/♀) — mas nunca trancamos uma marca já feita */
          if (!locked && !on && (k === "m" || k === "n" || k === "f") &&
              allowed.indexOf(k) === -1) {
            locked = true;
            lockWhy = t("e.noGender");
          }
          const b = el("button", "mk" + (on ? " on" : "") + (locked ? " locked" : ""));
          b.type = "button";
          const box = el("span", "box");
          if (on) box.appendChild(Icons.svg("check", 12));
          b.append(box, el("span", null, t("e." + k)));
          if (locked) { b.title = lockWhy; b.disabled = true; }
          else {
            b.addEventListener("click", () => {
              const nowOn = Store.toggle(entry.id, k);
              b.classList.toggle("on", nowOn);
              box.textContent = "";
              if (nowOn) box.appendChild(Icons.svg("check", 12));
              App.markDirty();
            });
          }
          marks.appendChild(b);
        }
        return marks;
      };
      right.appendChild(markGrid(REGISTER_MARKS));
      const lh = el("div", "small dim", t("living.fichaTitle"));
      lh.style.margin = "10px 0 5px";
      right.append(lh, markGrid(LIVING_MARKS));
      d.appendChild(right);
      sheet.appendChild(d);

      const meta = el("div", "meta");
      const bits = [`${t("e.dexNo")} ${entry.num}`, `${t("e.region")}: ${regionLabel(entry.region)}`];
      if (entry.gender) bits.push(entry.gender);
      if (entry.flags.length) bits.push(entry.flags.map(flagLabel).join(", "));
      meta.textContent = bits.join(" · ");
      sheet.appendChild(meta);

      const dl = el("div", "datelist");
      for (const g of Agg.skeleton.dateKeys) {
        dl.append(el("span", "k", t("tl." + g)), el("span", "v", fmtDate(entry.debut[g])));
      }
      sheet.appendChild(dl);

      if (siblings && siblings.length > 1) {
        const other = siblings.filter(e => e.id !== entry.id);
        if (other.length) {
          const h = el("div", "small dim");
          h.style.margin = "15px 0 7px";
          h.textContent = t("e.siblings", { n: other.length });
          const g = el("div", "grid");
          for (const e of other) {
            const card = el("div", "mon");
            card.appendChild(Sprites.img(e, false));
            card.appendChild(el("div", "nm", nameOf(e)));
            if (Store.has(e.id, "caught")) card.classList.add("got");
            card.addEventListener("click", () => this.openEntry(e, siblings));
            g.appendChild(card);
          }
          sheet.append(h, g);
        }
      }
    });
  }
};
