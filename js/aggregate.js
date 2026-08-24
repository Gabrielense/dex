/* Motor de agregação. Espelha tools/check_resumo.py — as duas leem
   data/categories.json, então as regras não podem divergir.

   Regra central (diferente da planilha): categorias de escopo "dex" agrupam
   por Número e aceitam QUALQUER entrada daquele número. É assim que o jogo
   conta — um Pikachu de fantasia conta para o Pikachu, uma letra de Unown
   conta para o Unown. A coluna "Dex"/canônica da planilha existe só porque o
   Excel precisava de uma linha única; aqui ela não é usada em nenhuma conta. */

/* Ordem de exibição das formas/fantasias do Pikachu (número 25) - copiada
   do DEX_ORDER do pikachugo (mesmo ID de sprite, mesma fonte de verdade
   dos três sites) porque não é nem alfabética nem pela ordem do ID: é a
   ordem de lançamento que o Gabriel já curou lá. Aplicada em qualquer
   lugar que liste várias entradas do Pikachu juntas (ver reorderPikachu).
   Display order for Pikachu's (number 25) forms/costumes - copied from
   pikachugo's DEX_ORDER (same sprite ID, same source of truth across all
   three sites) because it's neither alphabetical nor ID order: it's the
   release order Gabriel already curated there. Applied everywhere
   multiple Pikachu entries get listed together (see reorderPikachu). */
const PIKACHU_ORDER = [
  "0025-00-00-01", "0025-00-00-02", "0025-00-00-03", "0025-00-00-04", "0025-00-00-05", "0025-00-00-06",
  "0025-00-00-07", "0025-00-00-11", "0025-00-00-08", "0025-00-00-09", "0025-00-00-12",
  "0025-00-00-15", "0025-00-00-14", "0025-00-00-16", "0025-00-00-17", "0025-00-00-18", "0025-00-00-19",
  "0025-00-00-21", "0025-00-00-24", "0025-00-00-26", "0025-00-00-29", "0025-00-00-33", "0025-00-00-32",
  "0025-00-00-34", "0025-00-00-41", "0025-00-00-42", "0025-00-00-43", "0025-00-00-44", "0025-00-00-53", "0025-00-00-54",
  "0025-00-00-55", "0025-00-00-79", "0025-00-00-10", "0025-00-02-13", "0025-00-01", "0025-00-00-20",
  "0025-00-00-22", "0025-00-00-23", "0025-00-00-30", "0025-00-02-27", "0025-00-02-28", "0025-00-00-25",
  "0025-00-00-31", "0025-00-00-36", "0025-00-00-35", "0025-00-00-46", "0025-00-00-38", "0025-00-00-40",
  "0025-00-00-37", "0025-00-00-39", "0025-00-00-56", "0025-00-00-58", "0025-00-00-57", "0025-00-00-59",
  "0025-00-00-62", "0025-00-00-61", "0025-00-00-63", "0025-00-00-64", "0025-00-00-65", "0025-00-00-67",
  "0025-00-00-68", "0025-00-00-71", "0025-00-00-69", "0025-00-00-70", "0025-00-00-72", "0025-00-00-78",
  "0025-00-00-77", "0025-00-00-76", "0025-00-00-75", "0025-00-00-74", "0025-00-00-73", "0025-00-00-50",
  "0025-00-00-49", "0025-00-00-52", "0025-00-00-51", "0025-00-00-47", "0025-00-00-45", "0025-00-02-60",
  "0025-00-00-48", "0025-00-00-66", "0025-00-00-80", "0025-00-00-83", "0025-00-00-84", "0025-00-00-85",
  "0025-00-00-86", "0025-00-00-81", "0025-00-00-82", "0025-00-00-87", "0025-00-00-88", "0025-00-00-90",
  "0025-00-00-91", "0025-00-00-92", "0025-00-00-89", "0025-00-00-93"
];
const PIKACHU_RANK = new Map(PIKACHU_ORDER.map((id, i) => [id, i]));
/* +F (fêmea) segue o mesmo posto do macho - mesmo rank, o par fica junto */
function pikachuRank(id) {
  const r = PIKACHU_RANK.get(id.replace(/\+F$/, ""));
  return r === undefined ? PIKACHU_ORDER.length : r;
}
/* Reordena SÓ o Pikachu (num 25) dentro de uma lista maior, sem mexer na
   posição relativa das outras espécies - troca os valores nos índices
   onde há Pikachu, mantendo os índices em si (partial in-place sort). */
function reorderPikachu(list, numOf, idOf) {
  const idxs = [];
  for (let i = 0; i < list.length; i++) if (numOf(list[i]) === 25) idxs.push(i);
  if (idxs.length < 2) return list;
  const vals = idxs.map(i => list[i]).sort((a, b) => pikachuRank(idOf(a)) - pikachuRank(idOf(b)));
  idxs.forEach((i, k) => { list[i] = vals[k]; });
  return list;
}

const Agg = {
  skeleton: null,
  categories: [],
  byCat: null,          // key -> categoria
  today: null,          // "YYYY-MM-DD"
  dexRegion: null,      // num -> região
  byNum: null,          // num -> [entradas]
  byId: null,           // id -> entrada

  init(skeleton, categories, catdoc, evolutions) {
    this.skeleton = skeleton;
    this.categories = categories;
    this.catdoc = catdoc || {};
    this.byCat = {};
    categories.forEach(c => { this.byCat[c.key] = c; });
    this.backgrounds = [];

    /* Grafo de evolução -> quem precede cada NÚMERO (não forma: a busca do
       jogo agrupa por número, e "quem evolui pra isso" já é a mesma pergunta
       pra qualquer forma daquele número - ver data/evolutions.json). */
    this.numEvolvesFrom = new Map();
    for (const n of (evolutions && evolutions.chains) || []) {
      for (const f of n.evolvesFrom) {
        let s = this.numEvolvesFrom.get(n.num);
        if (!s) { s = new Set(); this.numEvolvesFrom.set(n.num, s); }
        s.add(f.num);
      }
    }
    this._preEvoCache = new Map();

    const d = new Date();
    this.today = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");

    this.byNum = new Map();
    this.byId = new Map();
    for (const e of skeleton.entries) {
      this.byId.set(e.id, e);
      let g = this.byNum.get(e.num);
      if (!g) { g = []; this.byNum.set(e.num, g); }
      g.push(e);
    }
    /* Pikachu (25) na ordem do pikachugo, não na ordem que a planilha
       tinha - afeta a ficha ("outras entradas deste número") e qualquer
       tela que liste o grupo inteiro do número 25. */
    const pika = this.byNum.get(25);
    if (pika) pika.sort((a, b) => pikachuRank(a.id) - pikachuRank(b.id));

    /* Regiões que já entraram no Pokédex do jogo: alguma entrada lançada.
       O total do jogo (1025 hoje) é menor que o total da planilha (1028)
       porque números de geração não lançada ainda não existem lá. */
    this.inGameRegions = new Set();
    for (const e of skeleton.entries) {
      if (e.debut.base) this.inGameRegions.add(e.region);
    }

    // Região de um número da dex = a da entrada base (ID de 4 dígitos).
    this.dexRegion = new Map();
    for (const e of skeleton.entries) {
      if (e.id === String(e.num).padStart(4, "0")) this.dexRegion.set(e.num, e.region);
    }
    for (const e of skeleton.entries) {
      if (!this.dexRegion.has(e.num) && e.dexCanon) this.dexRegion.set(e.num, e.region);
    }
    for (const e of skeleton.entries) {
      if (!this.dexRegion.has(e.num)) this.dexRegion.set(e.num, e.region);
    }
    return this;
  },

  released(entry, gate) {
    const d = entry.debut[gate];
    return !!d && d <= this.today;
  },

  matchCond(entry, cond) {
    if (cond.flag) return entry.flags.indexOf(cond.flag) !== -1;
    if (cond.nonempty) return !!entry[cond.nonempty];
    if (cond.equals) return (entry[cond.equals.field] || "") === cond.equals.value;
    return true;
  },

  inSubset(entry, cat) {
    const sub = cat.subset;
    if (!sub) return true;
    if (sub.any) return sub.any.some(c => this.matchCond(entry, c));
    return this.matchCond(entry, sub);
  },

  /* Um item da categoria: entrada solta, ou um número da dex com suas entradas.
     -> { key, num, region, entries[], display, releasedOn, got } */
  items(catKey) {
    const cat = this.byCat[catKey];
    if (!cat) return [];
    const out = [];

    if (cat.scope === "entry") {
      for (const e of this.skeleton.entries) {
        if (!this.inSubset(e, cat)) continue;
        const rel = this.released(e, cat.gate);
        out.push({
          key: e.id, num: e.num, region: e.region, entries: [e], display: e,
          releasedOn: e.debut[cat.gate],
          released: rel,
          // marca so conta se ja foi lancado, senao pegos > lancados
          got: rel && Store.has(e.id, cat.mark)
        });
      }
      return reorderPikachu(out, it => it.num, it => it.display.id);
    }

    // escopo dex: agrupa por número
    for (const [num, group] of this.byNum) {
      const sub = group.filter(e => this.inSubset(e, cat));
      if (!sub.length) continue;
      const rel = sub.filter(e => this.released(e, cat.gate));
      // data de estreia do número = a mais antiga entre as entradas
      let earliest = null;
      for (const e of sub) {
        const d = e.debut[cat.gate];
        if (d && (!earliest || d < earliest)) earliest = d;
      }
      let inDenom = rel.length > 0;
      if (inDenom && cat.denomExcludeFlag) {
        inDenom = rel.some(e => e.flags.indexOf(cat.denomExcludeFlag) === -1);
      }
      out.push({
        key: String(num), num, region: this.dexRegion.get(num),
        entries: sub, display: this.baseEntry(num, sub),
        releasedOn: earliest,
        released: inDenom,
        // "pego" so vale dentro do que ja foi lancado, senao pegos > lancados
        got: inDenom && sub.some(e => Store.has(e.id, cat.mark))
      });
    }
    out.sort((a, b) => a.num - b.num);
    return out;
  },

  baseEntry(num, group) {
    const pad = String(num).padStart(4, "0");
    return group.find(e => e.id === pad)
        || group.find(e => e.dexCanon)
        || group[0];
  },

  /* Totais por categoria e região.
     -> { byRegion: {reg:{caught,released,total,inGame}}, total:{...} }
     inGame = só o que o Pokédex do jogo lista (exclui gerações que ainda
     nem entraram lá) — é o denominador comparável com a tela do jogo. */
  stats(catKey) {
    const items = this.items(catKey);
    const byRegion = {};
    const total = { caught: 0, released: 0, total: 0, inGame: 0 };
    for (const it of items) {
      const b = byRegion[it.region] ||
        (byRegion[it.region] = { caught: 0, released: 0, total: 0, inGame: 0 });
      b.total++; total.total++;
      if (this.inGameRegions.has(it.region)) { b.inGame++; total.inGame++; }
      if (it.released) { b.released++; total.released++; }
      if (it.got) { b.caught++; total.caught++; }
    }
    return { byRegion, total, items };
  },

  /* Quais gêneros esta ENTRADA pode ter no jogo. */
  allowedGenders(e) {
    if (e.flags.indexOf("genderless") !== -1) return ["n"];
    if (e.flags.indexOf("maleOnly") !== -1) return ["m"];
    if (e.flags.indexOf("femaleOnly") !== -1) return ["f"];
    if (e.gender === "♂") return ["m"];
    if (e.gender === "♀") return ["f"];
    return ["m", "f"];
  },

  /* Um NÚMERO da dex tem o gênero g? (qualquer entrada dele serve) */
  numHasGender(num, g) {
    const group = this.byNum.get(num) || [];
    return group.some(e => this.allowedGenders(e).indexOf(g) !== -1);
  },

  /* Tudo de uma vez, para o painel. */
  allStats() {
    const out = {};
    for (const c of this.categories) out[c.key] = this.stats(c.key);
    return out;
  },

  /* Faltantes: lançado e sem a marca.
     Separa em dois baldes, porque são tarefas diferentes:
       todo    — você TEM o Pokémon, falta esta marca. É o que dá pra caçar.
       blocked — você nem registrou o Pokémon ainda; primeiro resolva a dex.
     Ex.: Sortudo só fica "faltando" de verdade no primeiro balde; Silicobra e
     Sandaconda caem no segundo, que é por isso que a planilha diz "Completo!". */
  missingSplit(catKey, region) {
    const cat = this.byCat[catKey];
    const all = this.items(catKey).filter(it =>
      it.released && !it.got && (!region || it.region === region));
    if (cat.mark === "caught") return { todo: all, blocked: [] };
    const todo = [], blocked = [];
    for (const it of all) {
      (it.entries.some(e => Store.has(e.id, "caught")) ? todo : blocked).push(it);
    }
    return { todo, blocked };
  },

  missing(catKey, region) {
    return this.missingSplit(catKey, region).todo;
  },

  unreleased(catKey, region) {
    return this.items(catKey).filter(it =>
      !it.released && (!region || it.region === region));
  },

  /* O oposto de missing(): o que você já tem marcado — pra poder navegar
     os sprites de uma categoria completa em vez de só ver "Completo!". */
  registered(catKey, region) {
    return this.items(catKey).filter(it =>
      it.got && (!region || it.region === region));
  },

  /* Todos os números de pré-evolução na cadeia (transitivo: Venusaur -> 2, 1),
     achatado por NÚMERO — a forma não importa aqui, ver comentário no init().
     Memoizado porque a mesma cadeia é percorrida de novo a cada tela. */
  preEvoNums(num) {
    let hit = this._preEvoCache.get(num);
    if (hit) return hit;
    const out = new Set();
    const walk = n => {
      for (const p of (this.numEvolvesFrom.get(n) || [])) {
        if (out.has(p)) continue;      // guarda contra ciclo, por via das dúvidas
        out.add(p);
        walk(p);
      }
    };
    walk(num);
    this._preEvoCache.set(num, out);
    return out;
  },

  /* String de busca do jogo: NÚMEROS da dex separados por vírgula.
     Números são mais curtos que nomes e funcionam em qualquer idioma do
     jogo (o nome em português nem sempre é o que a busca aceita).
     XXL e XXS ganham o prefixo do filtro de tamanho: "XXL&1,4,7" =
     tamanho XXL E (número 1 ou 4 ou 7) — na busca do GO a vírgula é OU
     e o & é E.
     includePreEvo soma os números de quem evolui pra cada faltante (Bulbasaur
     e Ivysaur quando falta Venusaur) - dedupe pelo mesmo Set, então um número
     que já ia entrar por conta própria não repete. Fantasias ficam de fora:
     evoluir a espécie lisa não garante a fantasia (caso a caso, sem dados
     ainda - ver PLANS.md). */
  searchString(catKey, region, includePreEvo) {
    const cat = this.byCat[catKey];
    const seen = new Set(), nums = [];
    const add = n => { if (!seen.has(n)) { seen.add(n); nums.push(n); } };
    for (const it of this.missing(catKey, region)) {
      add(it.num);
      if (includePreEvo && !it.display.costumePt) {
        for (const anc of this.preEvoNums(it.num)) add(anc);
      }
    }
    if (!nums.length) return "";
    nums.sort((a, b) => a - b);
    const prefix = cat.mark === "xxl" ? "XXL&"
                 : cat.mark === "xxs" ? "XXS&"
                 : cat.searchKeyword ? cat.searchKeyword[LANG] + "&" : "";
    return prefix + nums.join(",");
  },

  /* Mesma coisa para uma lista qualquer de itens (usada no Living Dex). */
  numberString(items, prefix) {
    const seen = new Set(), nums = [];
    for (const it of items) {
      if (!seen.has(it.num)) { seen.add(it.num); nums.push(it.num); }
    }
    if (!nums.length) return "";
    nums.sort((a, b) => a - b);
    return (prefix || "") + nums.join(",");
  },

  /* ---- linha do tempo ---- */
  /* Mapa data -> [entradas] para um tipo de estreia. Fantasias ficam de fora
     por padrão (poluem a régua — um evento de fantasia às vezes é 1 estreia
     "de verdade" e 8 variações de traje no mesmo dia); showCostumes religa. */
  debutsByDate(gate, onlyMissing, showCostumes) {
    const map = new Map();
    for (const e of this.skeleton.entries) {
      const d = e.debut[gate];
      if (!d) continue;
      if (!showCostumes && e.costumePt) continue;
      if (onlyMissing) {
        const mark = GATE_MARK[gate];
        if (mark && Store.has(e.id, mark)) continue;
      }
      let a = map.get(d);
      if (!a) { a = []; map.set(d, a); }
      a.push(e);
    }
    return map;
  },

  /* ---------------------------------------------------------------- gênero
     Três perguntas:
       dex     — nos números que têm macho E fêmea, tenho os dois marcados?
       diff    — nas entradas com diferença visual de gênero, tenho o par todo?
       onlyOne — quais são os que eu só tenho de um gênero?
     "Dois gêneros" = número lançado sem nenhuma flag SomenteM/SomenteF/SomenteN. */
  genderStats() {
    const dual = [], onlyM = [], onlyF = [], neither = [];

    for (const [num, group] of this.byNum) {
      const rel = group.filter(e => this.released(e, "base"));
      if (!rel.length) continue;
      const single = rel.some(e =>
        e.flags.indexOf("maleOnly") !== -1 ||
        e.flags.indexOf("femaleOnly") !== -1 ||
        e.flags.indexOf("genderless") !== -1);
      if (single) continue;

      const hasM = group.some(e => Store.has(e.id, "m"));
      const hasF = group.some(e => Store.has(e.id, "f"));
      const caught = group.some(e => Store.has(e.id, "caught"));
      const item = {
        key: String(num), num, region: this.dexRegion.get(num),
        entries: group, display: this.baseEntry(num, group),
        released: true, got: hasM && hasF, hasM, hasF, caught
      };
      dual.push(item);
      if (hasM && !hasF) onlyM.push(item);
      else if (hasF && !hasM) onlyF.push(item);
      else if (!hasM && !hasF) neither.push(item);
    }

    /* Pares com diferença visual (coluna DiF. Sex. = ♂ / ♀).
       Casa pelo ID sem o sufixo +F — de propósito NÃO usa o Número, que em
       algumas linhas da planilha veio errado (autofill do Excel). O ID é o
       campo confiável. */
    const pairs = new Map();
    for (const e of this.skeleton.entries) {
      if (!e.gender) continue;
      const key = e.id.replace(/\+F$/, "");
      let p = pairs.get(key);
      if (!p) { p = []; pairs.set(key, p); }
      p.push(e);
    }

    /* Três situações diferentes, que não devem virar um número só:
         full — tenho o par inteiro
         half — tenho um e falta o outro  <- a lacuna de gênero de verdade
         none — não tenho nenhum dos dois <- é fantasia faltando, não gênero
       E cada par é OU de uma fantasia OU da espécie em si (nunca os dois) —
       viram dois baldes separados: misturar "falta a Pikachu de evento X"
       com "falta o Frillish fêmea" não ajuda ninguém a decidir o que caçar. */
    let diffTotal = 0, diffFull = 0;
    const diffHalf = [], diffNone = [];
    let diffCTotal = 0, diffCFull = 0;
    const diffCHalf = [], diffCNone = [];
    for (const [key, g] of pairs) {
      const rel = g.filter(e => this.released(e, "base"));
      if (!rel.length) continue;
      const isCostume = !!rel[0].costumePt;
      const got = rel.filter(e => Store.has(e.id, "caught"));
      if (got.length === rel.length) {
        if (isCostume) diffCTotal++, diffCFull++;
        else diffTotal++, diffFull++;
        continue;
      }
      if (isCostume) diffCTotal++; else diffTotal++;
      const item = {
        key, num: rel[0].num, region: rel[0].region,
        entries: rel, display: got[0] || rel[0], released: true, got: false,
        missingEntries: rel.filter(e => !Store.has(e.id, "caught"))
      };
      const half = got.length ? diffHalf : diffNone;
      const halfC = got.length ? diffCHalf : diffCNone;
      (isCostume ? halfC : half).push(item);
    }

    reorderPikachu(diffHalf, it => it.num, it => it.display.id);
    reorderPikachu(diffNone, it => it.num, it => it.display.id);
    reorderPikachu(diffCHalf, it => it.num, it => it.display.id);
    reorderPikachu(diffCNone, it => it.num, it => it.display.id);

    return {
      dual, onlyM, onlyF, neither,
      dualTotal: dual.length,
      dualBoth: dual.length - onlyM.length - onlyF.length - neither.length,
      diffTotal, diffFull, diffHalf, diffNone,
      diffCTotal, diffCFull, diffCHalf, diffCNone
    };
  },

  /* ------------------------------------------------------------ living dex
     "Living dex" = ter o Pokémon NA CAIXA agora, não só registrado.
     Camadas opcionais, na ordem do Gabriel; só a primeira vem ligada.
     Cada camada define seus próprios slots e qual marca os preenche.
     Um slot de escopo "dex" aceita a marca em qualquer entrada do número;
     um de escopo "entry" exige a marca naquela entrada específica. */
  livingTiers() {
    return [
      { key: "regular",  mark: "living",         scope: "dex",   gate: "base",
        icon: "ball",    color: "#1E9BD7", locked: true },
      { key: "forms",    mark: "living",         scope: "entry", gate: "base",
        icon: "form",    color: "#4F79C4" },
      { key: "gender",   mark: "living",         scope: "entry", gate: "base",
        icon: "genders", color: "#7c5cd6" },
      { key: "shinyL",   mark: "livingShiny",    scope: "dex",   gate: "shiny",
        icon: "sparkle", color: "#E0A21B" },
      { key: "event",    mark: "living",         scope: "entry", gate: "base",
        icon: "hat",     color: "#C4772B" },
      { key: "shadowL",  mark: "livingShadow",   scope: "dex",   gate: "shadow",
        icon: "flame",   color: "#7A4CC0" },
      { key: "purifiedL",mark: "livingPurified", scope: "dex",   gate: "shadow",
        icon: "purify",  color: "#22AEBC" },
      { key: "dmaxL",    mark: "livingDmax",     scope: "entry", gate: "dmax",
        icon: "dmax",    color: "#C6317B" },
      { key: "luckyL",   mark: "livingLucky",    scope: "dex",   gate: "base",
        icon: "clover",  color: "#EE7B22", excludeNotrade: true }
    ];
  },

  enabledLivingTiers() {
    const saved = Store.prefs.livingTiers;
    const on = new Set(saved && saved.length ? saved : ["regular"]);
    on.add("regular");                       // o padrão nunca desliga
    return on;
  },

  /* Slots de uma camada. genderOn muda o recorte de formas/fantasias:
     com gênero ligado, cada ♂ e ♀ vira um slot próprio; desligado, o par
     conta como um slot só (o id sem +F representa o par). */
  livingItems(tierKey) {
    const tier = this.livingTiers().find(t => t.key === tierKey);
    if (!tier) return [];
    const genderOn = this.enabledLivingTiers().has("gender");
    const out = [];

    const isFormEntry = e =>
      (e.regFormPt || e.altFormPt) && !e.costumePt &&
      e.flags.indexOf("mega") === -1 && e.altFormPt !== "Primitivo";

    if (tier.scope === "dex") {
      for (const [num, group] of this.byNum) {
        const rel = group.filter(e => this.released(e, tier.gate));
        let inDenom = rel.length > 0;
        if (inDenom && tier.excludeNotrade) {
          inDenom = rel.some(e => e.flags.indexOf("notrade") === -1);
        }
        const base = this.baseEntry(num, group);
        out.push({
          key: tierKey + ":" + num, num,
          region: this.dexRegion.get(num),
          entries: group, display: base, target: base,
          released: inDenom,
          got: inDenom && group.some(e => Store.has(e.id, tier.mark))
        });
      }
      out.sort((a, b) => a.num - b.num);
      return out;
    }

    // escopo entry: escolhe as entradas conforme a camada
    for (const e of this.skeleton.entries) {
      let want = false;
      if (tier.key === "forms") {
        want = isFormEntry(e) && (genderOn || !/\+F$/.test(e.id));
      } else if (tier.key === "gender") {
        want = !!e.gender && !e.costumePt;
      } else if (tier.key === "event") {
        want = !!e.costumePt && (genderOn || !/\+F$/.test(e.id));
      } else if (tier.key === "dmaxL") {
        want = !!e.debut.dmax;
      }
      if (!want) continue;
      const rel = this.released(e, tier.gate);
      out.push({
        key: tierKey + ":" + e.id, num: e.num, region: e.region,
        entries: [e], display: e, target: e,
        released: rel,
        got: rel && Store.has(e.id, tier.mark)
      });
    }
    return reorderPikachu(out, it => it.num, it => it.display.id);
  },

  livingStats(tierKey) {
    const items = tierKey.charAt(0) === "c" && tierKey.length > 6
      ? this.customItems(tierKey)
      : this.livingItems(tierKey);
    let caught = 0, released = 0;
    for (const it of items) {
      if (it.released) { released++; if (it.got) caught++; }
    }
    return { items, caught, released, total: items.length };
  },

  /* ------------------------------------------------- dexes personalizadas
     "Todas as fêmeas sortudas brilhantes" e afins: combinações livres de
     atributos, um slot por NÚMERO da dex.
     def.parts = {shiny,lucky,shadow,purified,dmax,perfect,xxl,xxs}
     def.gender = "" | "m" | "f"
     Lançado = todos os portões exigidos abertos para o número:
       shadow/purified -> estreia sombrosa; dmax -> estreia dinamax;
       shiny -> estreia brilhante; resto -> estreia normal.
       lucky ainda exige alguma entrada trocável; gênero exige que a
       espécie tenha aquele gênero. */
  customGates(def) {
    const g = new Set(["base"]);
    if (def.parts.shiny) g.add("shiny");
    if (def.parts.shadow || def.parts.purified) g.add("shadow");
    if (def.parts.dmax) g.add("dmax");
    return [...g];
  },

  customItems(tierId) {
    const def = Store.customTiers.find(x => x.id === tierId);
    if (!def) return [];
    const gates = this.customGates(def);
    const out = [];
    for (const [num, group] of this.byNum) {
      let ok = gates.every(gt => group.some(e => this.released(e, gt)));
      if (ok && def.parts.lucky) {
        ok = group.some(e => this.released(e, "base") &&
                             e.flags.indexOf("notrade") === -1);
      }
      if (ok && def.gender) ok = this.numHasGender(num, def.gender);
      if (!ok) continue;
      const base = this.baseEntry(num, group);
      out.push({
        key: tierId + ":" + num, num,
        region: this.dexRegion.get(num),
        entries: group, display: base, target: base,
        released: true,
        got: Store.customHas(tierId, num)
      });
    }
    out.sort((a, b) => a.num - b.num);
    return out;
  },

  /* Saúde dos dados: marcas que não contam em lugar nenhum porque a entrada
     não tem a data de estreia correspondente. Ou a marca está errada, ou
     falta preencher a data no esqueleto. */
  orphanMarks() {
    const MARK_GATE = {
      caught: "base", shiny: "shiny", shinyDex: "shiny", shadow: "shadow",
      purified: "shadow", shadowShiny: "shadowShiny", dmax: "dmax",
      dmaxShiny: "dmaxShiny", xxs: "base", xxl: "base", lucky: "base",
      perfect: "base", m: "base", n: "base", f: "base",
      living: "base", livingShiny: "shiny", livingShadow: "shadow",
      livingPurified: "shadow", livingDmax: "dmax", livingLucky: "base"
    };
    /* números que o dono do dataset mandou ignorar (ex.: fantasias de
       Pikachu com marcas sombrosas intencionais sem data) */
    const ignore = new Set(
      (this.catdoc._orphanIgnore && this.catdoc._orphanIgnore.nums) || []);
    const byMark = {};
    let total = 0;
    for (const e of this.skeleton.entries) {
      if (ignore.has(e.num)) continue;
      for (const k of MARK_ORDER) {
        if (!Store.has(e.id, k)) continue;
        if (this.released(e, MARK_GATE[k] || "base")) continue;
        (byMark[k] || (byMark[k] = [])).push(e);
        total++;
      }
    }
    return { total, byMark };
  },

  /* ---------------------------------------------------------- backgrounds
     Dex de backgrounds: marca PROPRIA por par (background, Pokemon) -
     Store.hasBackgroundMark. Nao da pra derivar da marca "caught": o
     mesmo Pokemon pode ter sido registrado com backgrounds diferentes (ou
     nenhum) em capturas diferentes ao longo do tempo. */
  initBackgrounds(data) {
    this.backgrounds = (data && data.backgrounds) || [];
  },

  backgroundStats(type) {
    const bgs = this.backgrounds.filter(b => b.type === type);
    let bgOwned = 0, pkmnTotal = 0, pkmnOwned = 0;
    for (const b of bgs) {
      let owned = 0;
      for (const p of b.pokemon) if (Store.hasBackgroundMark(b.id, p.id)) owned++;
      pkmnTotal += b.pokemon.length;
      pkmnOwned += owned;
      if (owned > 0) bgOwned++;
    }
    return { bgTotal: bgs.length, bgOwned, pkmnTotal, pkmnOwned };
  },

  backgroundItems(type) {
    return this.backgrounds
      .filter(b => b.type === type)
      .map(b => ({
        ...b,
        pokemon: reorderPikachu(b.pokemon.slice(), p => p.num, p => p.id),
        caught: b.pokemon.filter(p => Store.hasBackgroundMark(b.id, p.id)).length
      }))
      /* mais novo primeiro; sem data reconhecida (ver tools/build_backgrounds.py)
         cai por ano+nome, no fim do próprio ano. */
      .sort((a, b) => (b.debut || b.year + "-00-00").localeCompare(a.debut || a.year + "-00-00")
        || a.name.localeCompare(b.name));
  },

  /* Mapa data -> [backgrounds] para a Linha do Tempo — mesmo formato de
     debutsByDate(), pra reaproveitar o calendário. Só entram os que têm
     data reconhecida (ver build_backgrounds.py); onlyMissing filtra pros
     que ainda não têm nenhum Pokémon marcado (Store.hasBackgroundMark). */
  debutsByDateBackgrounds(onlyMissing) {
    const map = new Map();
    for (const b of this.backgrounds) {
      if (!b.debut) continue;
      if (onlyMissing && b.pokemon.some(p => Store.hasBackgroundMark(b.id, p.id))) continue;
      let a = map.get(b.debut);
      if (!a) { a = []; map.set(b.debut, a); }
      a.push(b);
    }
    return map;
  },

  entryTimeline(entry) {
    const out = [];
    for (const g of this.skeleton.dateKeys) {
      if (entry.debut[g]) out.push({ gate: g, date: entry.debut[g] });
    }
    out.sort((a, b) => a.date < b.date ? -1 : 1);
    return out;
  }
};

/* Qual marca corresponde a cada tipo de estreia (usado no filtro "só o que me falta") */
const GATE_MARK = {
  base: "caught", shiny: "shiny", shadow: "shadow",
  shadowShiny: "shadowShiny", dmax: "dmax", dmaxShiny: "dmaxShiny"
};
