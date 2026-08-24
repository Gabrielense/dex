/* Sprites vêm do repositório pogorewind (assets já existentes).
   Cadeia de fallback: ID exato -> sem sufixo de gênero -> ID base da espécie
   -> silhueta. Alguns IDs de variante não têm arquivo (ex.: 1024). */

const Sprites = (() => {
  /* raw.githubusercontent.com, não jsDelivr: jsDelivr cacheia por branch e,
     sob carga em rajada (uma grade grande pedindo 200+ sprites de uma vez),
     pode devolver 502/404 transitório enquanto preenche o cache — e como
     "bad" abaixo é permanente pro resto da sessão, um erro passageiro vira
     um sprite "sumido" pra sempre na tela. raw.githubusercontent.com não
     tem esse comportamento de cache frio. */
  const BASE = "https://raw.githubusercontent.com/Gabrielense/pogorewind/main/sprites/";
  const bad = new Set();      // URLs que já sabemos que faltam

  /* ---- correção de tamanho ----
     Vários PNGs têm o Pokémon pequeno num canvas cheio de margem
     transparente, então uns sprites saem minúsculos. Medimos a caixa real
     do desenho (pixels com alfa) e compensamos com transform:scale.
     Contenção de memória, de propósito:
       - UM canvas compartilhado de 40x40 (o ImageData de cada análise tem
         ~6 KB e morre logo depois; nunca guardamos bitmap nenhum);
       - o resultado é um número por arquivo, num cache em localStorage —
         cada sprite é analisado UMA vez na vida, não uma vez por sessão. */
  const SCALE_KEY = "pokeagenda.spriteScale.v1";
  const AN = 40;
  let scales = {};
  try { scales = JSON.parse(localStorage.getItem(SCALE_KEY) || "{}"); }
  catch (e) { scales = {}; }
  let saveTimer = null;
  function persistScales() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (Object.keys(scales).length < 4000) {
          localStorage.setItem(SCALE_KEY, JSON.stringify(scales));
        }
      } catch (e) { /* storage cheio — segue sem cache */ }
    }, 800);
  }

  let canvas = null, cctx = null, analysisOk = true;
  function measureScale(imgEl) {
    if (!analysisOk) return 1;
    try {
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = canvas.height = AN;
        cctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      cctx.clearRect(0, 0, AN, AN);
      cctx.drawImage(imgEl, 0, 0, AN, AN);
      const d = cctx.getImageData(0, 0, AN, AN).data;
      let minX = AN, minY = AN, maxX = -1, maxY = -1;
      for (let y = 0; y < AN; y++) {
        for (let x = 0; x < AN; x++) {
          if (d[(y * AN + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return 1;
      const frac = Math.max(maxX - minX + 1, maxY - minY + 1) / AN;
      if (frac >= 0.72) return 1;                    // tamanho normal
      return Math.min(1.8, Math.round((0.8 / frac) * 100) / 100);
    } catch (e) {
      analysisOk = false;                            // canvas contaminado etc.
      return 1;
    }
  }

  function applyScale(el, url) {
    const key = url.slice(BASE.length);
    const cached = scales[key];
    if (cached !== undefined) {
      if (cached > 1) el.style.transform = "scale(" + cached + ")";
      return;
    }
    const s = measureScale(el);
    scales[key] = s;
    persistScales();
    if (s > 1) el.style.transform = "scale(" + s + ")";
  }

  function url(id, shiny) {
    return BASE + encodeURIComponent(id + (shiny ? "+S" : "")) + ".png";
  }

  function chain(entry, shiny) {
    const out = [], id = entry.id;
    const push = v => { if (v && out.indexOf(v) === -1) out.push(v); };
    if (shiny) {
      push(url(id, true));
      push(url(id.replace(/\+F$/, ""), true));
    }
    push(url(id, false));
    push(url(id.replace(/\+F$/, ""), false));
    push(url(String(entry.num).padStart(4, "0"), false));
    return out;
  }

  /* Devolve sempre um <span class="sprite"> já pronto. O wrapper existe desde
     o começo, então a troca pela silhueta funciona mesmo se o erro de rede
     chegar antes do elemento entrar no DOM (404 em cache faz isso). */
  function img(entry, shiny, cls) {
    const box = document.createElement("span");
    box.className = "sprite" + (cls ? " " + cls : "");

    const urls = chain(entry, shiny).filter(u => !bad.has(u));
    if (!urls.length) { box.appendChild(placeholder()); return box; }

    const el = document.createElement("img");
    el.loading = "lazy";
    el.decoding = "async";
    el.crossOrigin = "anonymous";   // deixa o canvas medir o desenho
    el.alt = LANG === "en" ? (entry.nameEn || entry.namePt) : entry.namePt;
    box.appendChild(el);

    let i = 0;
    const next = () => {
      if (i > 0) bad.add(urls[i - 1]);
      if (i >= urls.length) {
        box.textContent = "";
        box.appendChild(placeholder());
        return;
      }
      el.src = urls[i++];
    };
    el.addEventListener("error", next);
    el.addEventListener("load", () => applyScale(el, urls[i - 1]));
    next();
    return box;
  }

  function placeholder() {
    const d = document.createElement("span");
    d.className = "sprite-ph";
    d.textContent = "?";
    return d;
  }

  return { img, url, placeholder, BASE };
})();
