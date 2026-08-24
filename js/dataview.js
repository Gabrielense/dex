/* Tela "Meus dados": importar, exportar, apagar.
   Tudo acontece no navegador — nenhum byte sai da máquina do usuário. */

const DataPanel = {
  log: null,

  render(root) {
    const p = el("div", "panel");
    p.append(el("h2", null, t("data.title")), el("p", "sub", t("data.sub")));

    /* ---- dropzone ---- */
    const dz = el("div", "dropzone");
    dz.append(el("span", "big", "📥"),
              el("div", null, t("data.drop")),
              el("div", "small dim", t("data.dropHint")));
    const input = el("input");
    input.type = "file";
    input.accept = ".xlsx,.csv,.json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      if (input.files[0]) this.handle(input.files[0]);
      input.value = "";
    });
    dz.addEventListener("click", () => input.click());
    ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); dz.classList.add("hot");
    }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); dz.classList.remove("hot");
    }));
    dz.addEventListener("drop", e => {
      const f = e.dataTransfer.files[0];
      if (f) this.handle(f);
    });
    p.append(dz, input);

    /* sem planilha? começa um dataset vazio e marca tudo pelo site */
    const freshRow = el("div", "row");
    freshRow.style.marginTop = "10px";
    const fresh = el("button", "btn");
    fresh.append(Icons.svg("pencil", 15), el("span", null, t("data.fresh")));
    fresh.addEventListener("click", () => {
      if (!Store.isEmpty() && !confirm(t("data.freshConfirm"))) return;
      Store.startFresh();
      App.rerender();
      toast(t("data.freshDone"));
    });
    freshRow.append(el("span", "small dim", t("data.freshHint")), fresh);
    p.appendChild(freshRow);

    /* ou o caminho Excel: esqueleto em branco pra preencher lá */
    const blankRow = el("div", "row");
    blankRow.style.marginTop = "6px";
    const blank = el("button", "btn");
    blank.append(Icons.svg("download", 15), el("span", null, t("data.blank")));
    blank.addEventListener("click", async () => {
      const blob = await XlsxIO.buildXlsx(Agg.skeleton, true);
      const n = new Date();
      const stamp = [n.getFullYear(), String(n.getMonth() + 1).padStart(2, "0"),
                     String(n.getDate()).padStart(2, "0")].join("-");
      const url = URL.createObjectURL(blob);
      const a = el("a");
      a.href = url; a.download = `PokeAgenda-em-branco-${stamp}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(t("data.done"));
    });
    blankRow.append(el("span", "small dim", t("data.blankHint")), blank);
    p.appendChild(blankRow);

    /* ---- estado atual ---- */
    const st = el("div");
    st.style.marginTop = "14px";
    const marked = Store.markedCount();
    const rows = [
      [t("data.skeleton"), `${Agg.skeleton.stats.entries} ${t("data.entries")} · ` +
        `${t("data.generated")} ${Agg.skeleton.generated.slice(0, 10)}`],
      [t("data.marked"), String(marked)],
      [t("data.lastImport"), Store.meta.lastImport
        ? new Date(Store.meta.lastImport).toLocaleString() : t("data.never")],
      [t("data.lastExport"), Store.meta.lastExport
        ? new Date(Store.meta.lastExport).toLocaleString() : t("data.never")]
    ];
    const dl = el("div", "datelist");
    for (const [k, v] of rows) { dl.append(el("span", "k", k), el("span", "v", v)); }
    st.append(el("div", "small dim", t("data.stats")), dl);
    p.appendChild(st);

    /* ---- exportar ---- */
    const ex = el("div", "row");
    ex.style.marginTop = "16px";
    const mk = (label, fn, cls) => {
      const b = el("button", "btn " + (cls || ""), label);
      b.disabled = Store.isEmpty();
      b.addEventListener("click", fn);
      return b;
    };
    ex.append(
      el("span", "small dim", t("data.export")),
      mk(t("data.exportXlsx"), () => this.download("xlsx"), "primary"),
      mk(t("data.exportCsv"), () => this.download("csv")),
      mk(t("data.exportJson"), () => this.download("json"))
    );
    p.appendChild(ex);

    const clear = el("button", "btn ghost", t("data.clear"));
    clear.style.marginTop = "12px";
    clear.disabled = Store.isEmpty();
    clear.addEventListener("click", () => {
      if (confirm(t("data.clearConfirm"))) {
        Store.clear();
        App.rerender();
        toast(t("data.done"));
      }
    });
    p.appendChild(clear);

    this.log = el("div", "log is-hidden");
    p.appendChild(this.log);
    root.appendChild(p);

    this.sheetFixes(root);
    if (!Store.isEmpty()) this.health(root);
  },

  /* Correções pendentes na própria planilha, declaradas em categories.json. */
  sheetFixes(root) {
    const items = (Agg.catdoc && Agg.catdoc._dataFixes && Agg.catdoc._dataFixes.items) || [];
    const warns = (Agg.skeleton.warnings || []);
    if (!items.length && !warns.length) return;

    const p = el("div", "panel");
    const h = el("h2");
    h.append(Icons.svg("warn", 17), el("span", null, t("fix.title")));
    h.style.color = "var(--warn)";
    p.append(h, el("p", "sub", t("fix.sub")));

    for (const it of items) {
      const d = el("div", "small");
      d.style.marginBottom = "8px";
      d.append(el("b", null, it.what), el("div", "dim", it.why));
      p.appendChild(d);
    }
    for (const w of warns) {
      const d = el("div", "small");
      d.style.marginBottom = "8px";
      d.append(el("b", null, w.what || ""), el("div", "dim", w.why || ""));
      p.appendChild(d);
    }
    root.appendChild(p);
  },

  /* Marcas que não contam porque falta a data de estreia correspondente. */
  health(root) {
    const o = Agg.orphanMarks();
    if (!o.total) return;
    const p = el("div", "panel");
    p.append(el("h2", null, t("health.title")),
             el("p", "sub", t("health.sub", { n: o.total })));
    for (const k in o.byMark) {
      const list = o.byMark[k];
      const line = el("div", "small");
      line.style.marginBottom = "4px";
      line.append(el("b", null, t("e." + k) + ": "),
        document.createTextNode(list.length + " — " +
          list.slice(0, 6).map(e => nameOf(e)).join(", ") +
          (list.length > 6 ? "…" : "")));
      p.appendChild(line);
    }
    p.appendChild(el("p", "small dim", t("health.hint")));
    root.appendChild(p);
  },

  say(msg, cls) {
    if (!this.log) return;
    this.log.classList.remove("is-hidden");
    const line = el("div", cls || null, msg);
    this.log.appendChild(line);
    this.log.scrollTop = this.log.scrollHeight;
  },

  async handle(file) {
    if (!Store.isEmpty() && !confirm(t("data.overwrite"))) return;
    this.log.textContent = "";
    this.say(t("data.logTitle"));
    this.say(file.name + "  (" + Math.round(file.size / 1024) + " KB)");
    try {
      const name = file.name.toLowerCase();
      let res;
      if (name.endsWith(".json")) {
        res = XlsxIO.readJson(await file.text(), Agg.skeleton);
      } else if (name.endsWith(".csv")) {
        res = XlsxIO.readCsv(await file.text(), Agg.skeleton);
      } else {
        this.say(t("data.importing"));
        const rows = await XlsxIO.readSheet(await file.arrayBuffer(), "PokéAgenda");
        res = XlsxIO.rowsToMarks(rows, Agg.skeleton);
      }

      const count = Store.replaceAll(res.rows);
      this.say(t("data.matched", { n: res.report.matched }), "ok");
      this.say(t("data.marksFound", { n: count }), "ok");
      if (res.report.unmatched.length) {
        this.say(t("data.unmatched", { n: res.report.unmatched.length }), "warn");
        this.say("  " + res.report.unmatched.slice(0, 12).join("\n  "), "warn");
        this.say(t("data.newRows"), "warn");
      }
      this.say(t("data.done"), "ok");
      toast(t("data.done"));
      App.rerender({ keepLog: this.log.innerHTML });
    } catch (err) {
      console.error(err);
      this.say(t("data.err") + ": " + err.message, "err");
    }
  },

  async download(kind) {
    const sk = Agg.skeleton;
    // data local, não UTC — senão o nome do arquivo pula um dia à noite
    const n = new Date();
    const stamp = [n.getFullYear(), String(n.getMonth() + 1).padStart(2, "0"),
                   String(n.getDate()).padStart(2, "0")].join("-");
    let blob, fname;
    if (kind === "xlsx") {
      blob = await XlsxIO.buildXlsx(sk);
      fname = `PokeAgenda-${stamp}.xlsx`;
    } else if (kind === "csv") {
      blob = XlsxIO.buildCsv(sk);
      fname = `PokeAgenda-${stamp}.csv`;
    } else {
      blob = XlsxIO.buildJson(sk);
      fname = `pokeagenda-backup-${stamp}.json`;
    }
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url; a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    Store.noteExport();
    App.refreshBanner();
    toast(fname);
  }
};
