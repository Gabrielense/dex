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
    /* ...a não ser que o endereço já diga a aba (F5, link salvo). */
    this.readHash();

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
      /* categoria do endereço que não existe (link velho, digitado errado) */
      if (!Agg.byCat[Lists.state.cat]) Lists.state.cat = "pokemon";

      /* Backgrounds e opcional: um data/backgrounds.json ausente ou
         quebrado nao pode derrubar o resto do site (as outras telas nao
         dependem dele). initBackgrounds([]) ja e o padrao de init(). */
      try {
        const bgRes = await fetch("data/backgrounds.json");
        if (bgRes.ok) Agg.initBackgrounds(await bgRes.json());
      } catch (bgErr) {
        console.warn("data/backgrounds.json indisponivel", bgErr);
      }
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

  /* Cada aba tem seu endereço (#gamedex, #lists/shiny...): F5 volta pra
     mesma aba e o Voltar do navegador anda entre as abas. O pedaço depois
     da barra é a categoria escolhida dentro de Faltantes / Pokédex. */
  VIEWS: ["dashboard", "gamedex", "lists", "living", "backgrounds", "timeline", "data"],

  readHash() {
    const [view, sub] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (this.VIEWS.indexOf(view) === -1) return false;
    this.view = view;
    if (sub && view === "gamedex" && GameDex.TABS.some(x => x.key === sub)) GameDex.tab = sub;
    if (sub && view === "lists") Lists.state.cat = sub;
    return true;
  },

  hashFor() {
    const sub = this.view === "gamedex" ? GameDex.tab
      : this.view === "lists" ? Lists.state.cat : "";
    return "#" + this.view + (sub ? "/" + sub : "");
  },

  /* push = aba nova (vira um passo do Voltar); senão só atualiza o endereço */
  syncHash(push) {
    const h = this.hashFor();
    if (location.hash === h) return;
    if (push) history.pushState(null, "", h);
    else history.replaceState(null, "", h);
  },

  bindChrome() {
    window.addEventListener("popstate", () => {
      if (!this.readHash()) return;
      closeSheet();
      this.rerender({ fromHistory: true });
    });
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
    this.rerender({ push: true });
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
    document.body.classList.remove("gd-on");
    const params = this.params;
    this.params = null;

    if (this.view === "dashboard") Dashboard.render(main);
    else if (this.view === "gamedex") GameDex.render(main);
    else if (this.view === "lists") Lists.render(main, params);
    else if (this.view === "living") Living.render(main);
    else if (this.view === "backgrounds") Backgrounds.render(main);
    else if (this.view === "timeline") Timeline.render(main);
    else if (this.view === "data") {
      DataPanel.render(main);
      if (opts && opts.keepLog) {
        DataPanel.log.innerHTML = opts.keepLog;
        DataPanel.log.classList.remove("is-hidden");
      }
    }
    if (!(opts && opts.fromHistory)) this.syncHash(opts && opts.push);
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
