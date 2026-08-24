/* Controlador: carrega os dados, troca de tela, idioma e tema. */

const App = {
  view: "dashboard",
  params: null,
  ready: false,

  async boot() {
    const prefs = Store.loadPrefs();
    const guess = (navigator.language || "pt").slice(0, 2) === "en" ? "en" : "pt";
    setLang(prefs.lang || guess);
    document.documentElement.lang = LANG === "en" ? "en" : "pt-BR";

    /* Sem preferência salva ainda: no desktop abre no tema claro por
       padrão; no celular segue o tema do aparelho, como sempre foi.
       Uma vez que a pessoa escolhe um tema (inclusive "auto" pelo botão),
       essa escolha fica salva e vale em qualquer dispositivo. */
    let theme = prefs.theme;
    if (localStorage.getItem("pokeagenda.prefs") === null && this.isDesktop()) {
      theme = "light";
    }
    this.applyTheme(theme);
    Store.load();
    /* Sem dado nenhum ainda (nem importado, nem "começar do zero"): abre
       direto em Meus dados, que é a única tela útil nesse estado — o
       Painel só faz sentido depois que existe alguma marca pra mostrar. */
    if (Store.isEmpty()) this.view = "data";

    try {
      const [sk, cats, evo] = await Promise.all([
        fetch("data/skeleton.json").then(r => {
          if (!r.ok) throw new Error("skeleton.json HTTP " + r.status);
          return r.json();
        }),
        fetch("data/categories.json").then(r => {
          if (!r.ok) throw new Error("categories.json HTTP " + r.status);
          return r.json();
        }),
        fetch("data/evolutions.json").then(r => {
          if (!r.ok) throw new Error("evolutions.json HTTP " + r.status);
          return r.json();
        })
      ]);
      Agg.init(sk, cats.categories, cats, evo);
    } catch (err) {
      document.getElementById("main").innerHTML =
        '<div class="panel"><h2>Erro ao carregar os dados</h2>' +
        '<p class="sub">' + String(err.message) + '</p>' +
        '<p class="small dim">Se você abriu o arquivo direto do disco (file://), ' +
        'rode um servidor local: <code>python -m http.server</code> na pasta do projeto.</p></div>';
      return;
    }

    this.ready = true;
    this.bindChrome();
    this.rerender();
    this.refreshBanner();

    const stamp = document.getElementById("footStamp");
    if (stamp) stamp.textContent = Agg.skeleton.generated.slice(0, 10);
  },

  bindChrome() {
    document.getElementById("tabs").addEventListener("click", e => {
      const b = e.target.closest(".tab");
      if (b) this.go(b.dataset.view);
    });
    document.getElementById("langBtn").addEventListener("click", () => {
      setLang(LANG === "pt" ? "en" : "pt");
      Store.prefs.lang = LANG;
      Store.savePrefs();
      document.documentElement.lang = LANG === "en" ? "en" : "pt-BR";
      this.rerender();
      this.refreshBanner();
    });
    document.getElementById("themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : cur === "light" ? null : "dark";
      this.applyTheme(next);
      Store.prefs.theme = next;
      Store.savePrefs();
    });
    document.getElementById("bannerX").addEventListener("click", () => {
      document.getElementById("banner").classList.add("is-hidden");
    });
    document.getElementById("bannerCta").addEventListener("click", () => this.go("data"));
  },

  applyTheme(th) {
    if (th) document.documentElement.setAttribute("data-theme", th);
    else document.documentElement.removeAttribute("data-theme");
  },

  /* Mouse fino + hover disponível = aparelho "de mesa". Celulares e
     tablets (ponteiro grosso, sem hover) caem no padrão "segue o sistema". */
  isDesktop() {
    return !!(window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  },

  go(view, params) {
    this.view = view;
    this.params = params || null;
    closeSheet();
    this.rerender();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  rerender(opts) {
    if (!this.ready) return;
    for (const b of document.querySelectorAll(".tab")) {
      b.classList.toggle("is-active", b.dataset.view === this.view);
    }
    // rótulos fixos
    for (const n of document.querySelectorAll("[data-i18n]")) {
      n.textContent = t(n.dataset.i18n);
    }
    const langLabel = document.getElementById("langLabel");
    if (langLabel) langLabel.textContent = LANG.toUpperCase();

    const main = document.getElementById("main");
    main.textContent = "";
    const params = this.params;
    this.params = null;

    if (this.view === "dashboard") Dashboard.render(main);
    else if (this.view === "lists") Lists.render(main, params);
    else if (this.view === "living") Living.render(main);
    else if (this.view === "timeline") Timeline.render(main);
    else if (this.view === "data") {
      DataPanel.render(main);
      if (opts && opts.keepLog) {
        DataPanel.log.innerHTML = opts.keepLog;
        DataPanel.log.classList.remove("is-hidden");
      }
    }
    this.refreshBanner();
  },

  markDirty() { this.refreshBanner(); },

  refreshBanner() {
    const b = document.getElementById("banner");
    const txt = document.getElementById("bannerText");
    const cta = document.getElementById("bannerCta");
    if (!b) return;
    if (Store.isEmpty()) {
      txt.textContent = t("banner.none");
      cta.textContent = t("banner.cta");
      cta.classList.remove("is-hidden");
      b.classList.remove("is-hidden");
    } else if (Store.meta.dirty) {
      txt.textContent = t("banner.stale");
      cta.textContent = t("data.export");
      cta.classList.remove("is-hidden");
      b.classList.remove("is-hidden");
    } else {
      b.classList.add("is-hidden");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.boot());
