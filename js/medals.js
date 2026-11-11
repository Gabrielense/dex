/* Tela "Medalhas": medalhas normais (valor + tier), medalhas de evento e os
   desafios do Colecionador de Elite. O esqueleto vem de data/medals.json
   (tools/export_medals.py); o progresso pessoal vive em Store.medals e
   viaja na aba "Medalhas" do .xlsx e no backup .json.
   "Medals" tab: standard medals (value + tier), event medals and the Elite
   Collector challenges. Skeleton from data/medals.json; personal progress in
   Store.medals, carried by the .xlsx "Medalhas" sheet and the .json backup. */

const MEDAL_TIERS = ["Bronze", "Prata", "Ouro", "Platina"];
const ELITE_STATUS = ["", "x", "_", "Pago", "Regional", "Pago/Regional"];

const Medals = {
  state: { tab: "standard", onlyMissing: false },

  data() { return (App.medals && App.medals.standard) ? App.medals : null; },
  medalName: m => (LANG === "en" ? (m.nameEn || m.namePt) : m.namePt),

  stats() {
    const d = this.data();
    const s = { platinum: 0, standardTotal: d.standard.length, event: 0, eventTotal: d.event.length,
                eliteDone: 0, eliteMissed: 0, eliteTotal: d.elite.length };
    for (const m of d.standard) if ((Store.medals.standard[m.id] || {}).tier === "Platina") s.platinum++;
    for (const e of d.event) if (Store.medals.event[e.id]) s.event++;
    for (const e of d.elite) {
      const st = (Store.medals.elite[e.id] || {}).status || "";
      if (st === "x") s.eliteDone++;
      else if (st) s.eliteMissed++;
    }
    return s;
  },

  render(root) {
    const d = this.data();
    if (!d) {
      const e = el("div", "panel empty-state");
      e.append(Icons.svg("warn", 38), el("div", null, t("md.unavailable")));
      root.appendChild(e);
      return;
    }
    const s = this.stats();
    const p1 = el("div", "panel");
    p1.append(el("h2", null, t("md.title")), el("p", "sub", t("md.sub")));
    const k = el("div", "kpis");
    k.append(this.kpi("standard", t("md.platinum"), s.platinum, s.standardTotal, "#8A8F99"),
             this.kpi("event", t("md.event"), s.event, s.eventTotal, "#E0A21B"),
             this.kpi("elite", t("md.elite"), s.eliteDone, s.eliteTotal, "#1E9BD7",
                      s.eliteMissed ? t("md.missedCount", { n: s.eliteMissed }) : null));
    p1.appendChild(k);
    if (Store.isEmpty()) p1.appendChild(el("p", "small dim", t("md.needData")));
    root.appendChild(p1);

    const p2 = el("div", "panel");
    const chips = el("div", "chips");
    for (const key of ["standard", "event", "elite"]) {
      const c = el("button", "chip" + (this.state.tab === key ? " is-on" : ""));
      c.type = "button";
      c.textContent = t("md." + key);
      c.addEventListener("click", () => { this.state.tab = key; App.rerender(); });
      chips.appendChild(c);
    }
    const miss = el("button", "chip" + (this.state.onlyMissing ? " is-on" : ""));
    miss.type = "button";
    miss.textContent = t("md.onlyMissing");
    miss.addEventListener("click", () => { this.state.onlyMissing = !this.state.onlyMissing; App.rerender(); });
    chips.appendChild(miss);
    p2.appendChild(chips);
    if (this.state.tab === "standard") this.standardList(p2, d);
    else if (this.state.tab === "event") this.eventList(p2, d);
    else this.eliteList(p2, d);
    root.appendChild(p2);
  },

  kpi(tabKey, label, n, total, color, extra) {
    const b = el("button", "kpi" + (this.state.tab === tabKey ? " done" : ""));
    b.type = "button";
    b.style.setProperty("--c", color);
    const top = el("div", "kpi-top");
    top.append(Icons.svg("star", 18), el("span", "kpi-name", label));
    const num = el("div", "kpi-num");
    num.append(document.createTextNode(String(n)), el("span", "of", " / " + total));
    const bar = el("div", "bar");
    const fill = el("i");
    const p = pct(n, total);
    fill.style.width = p + "%";
    if (p >= 100) fill.className = "full";
    bar.appendChild(fill);
    const sub = el("div", "kpi-sub");
    sub.append(el("span", null, p + "%"), el("span", "dim", extra || missingLabel(total - n)));
    b.append(top, num, bar, sub);
    b.addEventListener("click", () => { this.state.tab = tabKey; App.rerender(); });
    return b;
  },

  /* ---- medalhas normais: valor digitado + tier escolhido ---- */
  standardList(p, d) {
    const can = !Store.isEmpty();
    for (const group of ["general", "type"]) {
      const items = d.standard.filter(m => m.group === group &&
        (!this.state.onlyMissing || (Store.medals.standard[m.id] || {}).tier !== "Platina"));
      if (!items.length) continue;
      p.appendChild(sectionHead(t("md." + group), items.length));
      const list = el("div", "md-list");
      for (const m of items) list.appendChild(this.standardRow(m, can));
      p.appendChild(list);
    }
  },

  standardRow(m, can) {
    const cur = Store.medals.standard[m.id] || {};
    const row = el("div", "md-row" + (cur.tier === "Platina" ? " is-done" : ""));
    const name = el("div", "md-name");
    name.append(el("b", null, this.medalName(m)), el("span", "small dim", " · " + t("md.max") + " " + m.max));
    row.appendChild(name);
    const barWrap = el("div", "md-bar");
    const bar = el("div", "bar");
    const fill = el("i");
    const v = Number(cur.value) || 0;
    fill.style.width = pct(v, m.max) + "%";
    if (v >= m.max) fill.className = "full";
    bar.appendChild(fill);
    barWrap.append(bar, el("span", "small dim", v ? v.toLocaleString() + " / " + m.max : "— / " + m.max));
    row.appendChild(barWrap);
    const ctl = el("div", "md-ctl");
    const inp = el("input");
    inp.type = "number"; inp.min = "0"; inp.step = "any"; inp.inputMode = "decimal";
    inp.value = cur.value != null ? cur.value : "";
    inp.placeholder = t("md.value");
    inp.disabled = !can;
    const sel = el("select");
    sel.disabled = !can;
    for (const tier of [""].concat(MEDAL_TIERS)) {
      const o = el("option", null, tier ? t("md.tier." + tier) : t("md.noTier"));
      o.value = tier;
      if ((cur.tier || "") === tier) o.selected = true;
      sel.appendChild(o);
    }
    const save = () => {
      const val = inp.value === "" ? null : Number(inp.value);
      let tier = sel.value;
      /* valor no máximo = platina, a menos que a pessoa escolha outro tier de propósito */
      if (val != null && val >= m.max && !tier) { tier = "Platina"; sel.value = tier; }
      Store.setMedal(m.id, val, tier);
      fill.style.width = pct(val || 0, m.max) + "%";
      fill.className = (val || 0) >= m.max ? "full" : "";
      barWrap.lastChild.textContent = val ? Number(val).toLocaleString() + " / " + m.max : "— / " + m.max;
      row.classList.toggle("is-done", tier === "Platina");
      App.markDirty();
    };
    inp.addEventListener("change", save);
    sel.addEventListener("change", save);
    ctl.append(inp, sel);
    row.appendChild(ctl);
    return row;
  },

  /* ---- medalhas de evento: tem / não tem ---- */
  eventList(p, d) {
    const can = !Store.isEmpty();
    const items = d.event.filter(e => !this.state.onlyMissing || !Store.medals.event[e.id]);
    p.appendChild(sectionHead(t("md.event"), items.length));
    const list = el("div", "md-list");
    for (const e of items) {
      const on = !!Store.medals.event[e.id];
      const row = el("label", "md-row md-check" + (on ? " is-done" : ""));
      const cb = el("input");
      cb.type = "checkbox"; cb.checked = on; cb.disabled = !can;
      cb.addEventListener("change", () => {
        Store.setEventMedal(e.id, cb.checked);
        row.classList.toggle("is-done", cb.checked);
        App.markDirty();
      });
      const name = el("div", "md-name");
      name.append(el("b", null, e.name),
        el("span", "small dim", " · " + fmtDate(e.date) + (e.place ? " · " + e.place : "")));
      row.append(cb, name);
      list.appendChild(row);
    }
    p.appendChild(list);
  },

  /* ---- Colecionador de Elite: status + data de registro ---- */
  eliteList(p, d) {
    const can = !Store.isEmpty();
    const items = d.elite.filter(e => !this.state.onlyMissing || (Store.medals.elite[e.id] || {}).status !== "x");
    p.appendChild(sectionHead(t("md.elite"), items.length));
    p.appendChild(el("p", "small dim", t("md.eliteHint")));
    const list = el("div", "md-list");
    for (const e of items) {
      const cur = Store.medals.elite[e.id] || {};
      const row = el("div", "md-row" + (cur.status === "x" ? " is-done" : cur.status ? " is-missed" : ""));
      const name = el("div", "md-name");
      name.append(el("b", null, e.name), el("span", "small dim", " · " + fmtDate(e.date)));
      row.appendChild(name);
      const ctl = el("div", "md-ctl");
      const sel = el("select");
      sel.disabled = !can;
      for (const st of ELITE_STATUS) {
        const o = el("option", null, t("md.status." + (st || "none")));
        o.value = st;
        if ((cur.status || "") === st) o.selected = true;
        sel.appendChild(o);
      }
      const dt = el("input");
      dt.type = "date"; dt.disabled = !can; dt.title = t("md.registered");
      dt.value = cur.date || "";
      const save = () => {
        Store.setElite(e.id, sel.value, dt.value || null);
        row.classList.toggle("is-done", sel.value === "x");
        row.classList.toggle("is-missed", !!sel.value && sel.value !== "x");
        App.markDirty();
      };
      sel.addEventListener("change", save);
      dt.addEventListener("change", save);
      ctl.append(sel, dt);
      row.appendChild(ctl);
      list.appendChild(row);
    }
    p.appendChild(list);
  }
};

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return LANG === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}
