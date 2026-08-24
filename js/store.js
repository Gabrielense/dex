/* Armazenamento local das marcas pessoais.
   Local storage of personal marks. Nothing here ever touches the network.

   Formato salvo: { v, marks: { "<id>": <bitmask> }, meta: {...} }
   Bitmask sobre MARK_ORDER — compacto o bastante para caber no localStorage. */

const MARK_ORDER = [
  "caught", "m", "n", "f", "shiny", "shadow", "purified", "shadowShiny",
  "dmax", "dmaxShiny", "shinyDex", "xxs", "xxl", "lucky", "perfect",
  /* Living Dex: "tenho este na caixa AGORA", separado de "já registrei".
     SEMPRE acrescente marcas novas no FIM — o índice vira bit no
     localStorage, e mudar a ordem embaralharia dados já salvos. */
  "living", "livingShiny", "livingShadow", "livingPurified",
  "livingDmax", "livingLucky"
];
const MARK_BIT = {};
MARK_ORDER.forEach((k, i) => { MARK_BIT[k] = 1 << i; });

const KEY = "pokeagenda.v1";
const PREF = "pokeagenda.prefs";

const Store = {
  marks: Object.create(null),   // id -> bitmask
  /* active: existe um dataset em uso — via importação OU "começar do zero".
     Sem isso, quem não tem planilha nenhuma ficava trancado no modo leitura. */
  meta: { lastImport: null, lastExport: null, dirty: false, active: false },
  /* Dexes vivas personalizadas ("todas as fêmeas sortudas brilhantes"):
     - customTiers: definições [{id, parts:{shiny,lucky,...}, gender}]
     - customMarks: {tierId: {num: 1}} — marca por NÚMERO da dex.
     Vivem só no navegador e no backup .json; a planilha não ganha colunas
     dinâmicas (o formato dela ficaria imprevisível). */
  customTiers: [],
  customMarks: Object.create(null),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      this.marks = o.marks || Object.create(null);
      this.meta = Object.assign(this.meta, o.meta || {});
      this.customTiers = o.customTiers || [];
      this.customMarks = o.customMarks || Object.create(null);
      return true;
    } catch (e) {
      console.warn("marks illegible, starting empty", e);
      return false;
    }
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, marks: this.marks, meta: this.meta,
        customTiers: this.customTiers, customMarks: this.customMarks
      }));
      return true;
    } catch (e) {
      console.error("could not save marks", e);
      return false;
    }
  },

  clear() {
    this.marks = Object.create(null);
    this.meta = { lastImport: null, lastExport: null, dirty: false, active: false };
    this.customTiers = [];
    this.customMarks = Object.create(null);
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  },

  /* Dataset novo, vazio: para quem não tem planilha nenhuma. */
  startFresh() {
    this.marks = Object.create(null);
    this.meta = { lastImport: null, lastExport: null, dirty: false, active: true };
    this.customTiers = [];
    this.customMarks = Object.create(null);
    this.save();
  },

  /* ---- dexes personalizadas ---- */
  addCustomTier(def) {
    def.id = "c" + Date.now().toString(36);
    this.customTiers.push(def);
    this.meta.dirty = true;
    this.save();
    return def.id;
  },
  removeCustomTier(id) {
    this.customTiers = this.customTiers.filter(x => x.id !== id);
    delete this.customMarks[id];
    this.meta.dirty = true;
    this.save();
  },
  customHas(tierId, num) {
    const m = this.customMarks[tierId];
    return !!(m && m[num]);
  },
  customToggle(tierId, num) {
    let m = this.customMarks[tierId];
    if (!m) m = this.customMarks[tierId] = {};
    const on = !m[num];
    if (on) m[num] = 1; else delete m[num];
    this.meta.dirty = true;
    this.save();
    return on;
  },

  has(id, key) { return ((this.marks[id] || 0) & MARK_BIT[key]) !== 0; },

  set(id, key, on) {
    const bit = MARK_BIT[key];
    if (!bit) return;
    let m = this.marks[id] || 0;
    m = on ? (m | bit) : (m & ~bit);
    if (m) this.marks[id] = m; else delete this.marks[id];
    this.meta.dirty = true;
    this.save();
  },

  toggle(id, key) {
    const now = !this.has(id, key);
    this.set(id, key, now);
    return now;
  },

  /* Substitui tudo (usado pela importação). rows: [{id, marks:{k:bool}}] */
  replaceAll(rows) {
    const m = Object.create(null);
    let count = 0;
    for (const r of rows) {
      let bits = 0;
      for (const k in r.marks) if (r.marks[k] && MARK_BIT[k]) { bits |= MARK_BIT[k]; count++; }
      if (bits) m[r.id] = bits;
    }
    this.marks = m;
    this.meta.lastImport = new Date().toISOString();
    this.meta.dirty = false;
    this.meta.active = true;
    this.save();
    return count;
  },

  markedCount() { return Object.keys(this.marks).length; },
  /* "vazio" = nenhum dataset em uso (nem importado, nem começado do zero) */
  isEmpty() { return this.markedCount() === 0 && !this.meta.active; },

  noteExport() {
    this.meta.lastExport = new Date().toISOString();
    this.meta.dirty = false;
    this.save();
  },

  /* preferências (idioma, tema, camadas do living dex) — separadas das marcas */
  prefs: { lang: null, theme: null, livingTiers: null },
  loadPrefs() {
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREF) || "{}")); }
    catch (e) { /* ignore */ }
    return this.prefs;
  },
  savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify(this.prefs)); }
    catch (e) { /* ignore */ }
  }
};
