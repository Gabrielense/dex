/* Leitura e escrita de .xlsx no navegador, sem bibliotecas.
   Read/write .xlsx in the browser, no libraries.

   Importar: só precisamos da coluna ID + as colunas de marcas. Datas de
   estreia vêm do esqueleto, então são ignoradas na importação (mas a gente
   avisa se a planilha do usuário parece mais nova que o esqueleto).
   Exportar: duas abas — "Instruções" (legenda das cores) e "PokéAgenda"
   (mesma ordem de colunas de sempre, agora com cabeçalhos coloridos por
   categoria e células M/N/F sinalizadas quando o gênero é impossível). */

const XlsxIO = (() => {

  /* ---------------------------------------------------------- helpers */
  function colIndex(ref) {              // "AB12" -> 27 (0-based)
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }
  function colName(i) {                 // 0 -> "A"
    let s = "";
    i++;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - r - 1) / 26; }
    return s;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const EPOCH = Date.UTC(1899, 11, 30);
  function isoToSerial(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  }
  function serialToIso(n) {
    const ms = EPOCH + Math.round(n) * 86400000;
    const d = new Date(ms);
    return [d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0")].join("-");
  }

  /* ------------------------------------------------------------ read
     opts.requireName: quando true, so aceita a aba de nome EXATO
     preferSheetName - lanca SHEET_NOT_FOUND em vez de cair pra sheets[0].
     Usado pra ler a aba opcional "Fundos" sem confundir com os dados
     principais quando a planilha e antiga e nao tem essa aba ainda. */
  async function readSheet(arrayBuffer, preferSheetName, opts) {
    const files = await Zip.read(arrayBuffer);
    const dec = new TextDecoder("utf-8");
    const parser = new DOMParser();
    const getXml = n => {
      const b = files.get(n);
      return b ? parser.parseFromString(dec.decode(b), "application/xml") : null;
    };

    // strings compartilhadas
    const shared = [];
    const ss = getXml("xl/sharedStrings.xml");
    if (ss) {
      for (const si of ss.getElementsByTagName("si")) {
        let s = "";
        for (const tt of si.getElementsByTagName("t")) s += tt.textContent;
        shared.push(s);
      }
    }

    // escolhe a aba
    const wbx = getXml("xl/workbook.xml");
    const rels = getXml("xl/_rels/workbook.xml.rels");
    let target = "xl/worksheets/sheet1.xml";
    if (wbx && rels) {
      const relMap = {};
      for (const r of rels.getElementsByTagName("Relationship")) {
        relMap[r.getAttribute("Id")] = r.getAttribute("Target");
      }
      const sheets = Array.from(wbx.getElementsByTagName("sheet"));
      const byName = sheets.find(s => s.getAttribute("name") === preferSheetName);
      if (opts && opts.requireName && !byName) {
        throw new Error("SHEET_NOT_FOUND");
      }
      let pick = byName || sheets[0];
      if (pick) {
        const rid = pick.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
          || pick.getAttribute("r:id");
        let tgt = relMap[rid];
        if (tgt) {
          if (tgt.charAt(0) === "/") tgt = tgt.slice(1);
          else if (tgt.indexOf("xl/") !== 0) tgt = "xl/" + tgt;
          if (files.has(tgt)) target = tgt;
        }
      }
    }

    const shx = getXml(target);
    if (!shx) throw new Error("Não achei a planilha dentro do arquivo.");

    const rows = [];
    for (const row of shx.getElementsByTagName("row")) {
      const arr = [];
      for (const c of row.getElementsByTagName("c")) {
        const ref = c.getAttribute("r") || "";
        const ci = ref ? colIndex(ref) : arr.length;
        const type = c.getAttribute("t");
        let val = "";
        if (type === "inlineStr") {
          const is = c.getElementsByTagName("is")[0];
          if (is) for (const tt of is.getElementsByTagName("t")) val += tt.textContent;
        } else {
          const v = c.getElementsByTagName("v")[0];
          if (v) {
            const raw = v.textContent;
            if (type === "s") val = shared[Number(raw)] || "";
            else val = raw;
          }
        }
        while (arr.length < ci) arr.push("");
        arr[ci] = val;
      }
      rows.push(arr);
    }
    return rows;
  }

  /* Casa as linhas lidas com o esqueleto e devolve as marcas. */
  function rowsToMarks(rows, skeleton) {
    const report = { matched: 0, unmatched: [], marks: 0, rows: rows.length - 1,
                     newerDates: [], sample: [] };
    if (!rows.length) throw new Error("Planilha vazia.");

    const header = rows[0].map(h => normHeader(h));
    const idx = {};
    for (const key in HEADER_MAP) {
      const i = header.indexOf(normHeader(key));
      if (i >= 0 && idx[HEADER_MAP[key]] === undefined) idx[HEADER_MAP[key]] = i;
    }
    if (idx.id === undefined) {
      throw new Error("Não achei a coluna 'ID' na planilha. " +
                      "Ela é o que liga cada linha ao sprite e ao esqueleto.");
    }

    const known = new Set(skeleton.entries.map(e => e.id));
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const id = String(row[idx.id] || "").trim();
      if (!id) continue;
      if (!known.has(id)) {
        if (report.unmatched.length < 40) {
          report.unmatched.push(id + (row[idx.namePt] ? " — " + row[idx.namePt] : ""));
        }
        continue;
      }
      report.matched++;
      const marks = {};
      for (const k of MARK_ORDER) {
        const i = idx[k];
        if (i === undefined) continue;
        const v = String(row[i] || "").trim();
        if (v) { marks[k] = true; report.marks++; }
      }
      out.push({ id, marks });
    }
    return { rows: out, report };
  }

  /* Cabecalhos da aba "Fundos" -> indice de coluna. */
  const BG_SHEET_COLUMNS = [
    ["ID do Fundo", "bgId"], ["Nome do Fundo", "bgName"],
    ["Tipo", "bgType"], ["ID do Pokémon", "pokemonId"],
    ["Nome do Pokémon", "pokemonName"], ["Via evolução", "viaEvolution"],
    ["Marcado", "marked"]
  ];

  /* rows: saida crua de readSheet(arrayBuffer, "Fundos", {requireName:true}).
     -> { bgId: { pokemonId: 1 } }, só os pares marcados com "x". */
  function backgroundRowsToMarks(rows) {
    if (!rows.length) return {};
    const header = rows[0].map(h => normHeader(h));
    const idx = {};
    for (const [h, k] of BG_SHEET_COLUMNS) {
      const i = header.indexOf(normHeader(h));
      if (i >= 0) idx[k] = i;
    }
    if (idx.bgId === undefined || idx.pokemonId === undefined) return {};
    const out = Object.create(null);
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const marked = String(row[idx.marked] || "").trim();
      if (!marked) continue;
      const bgId = String(row[idx.bgId] || "").trim();
      const pokemonId = String(row[idx.pokemonId] || "").trim();
      if (!bgId || !pokemonId) continue;
      if (!out[bgId]) out[bgId] = {};
      out[bgId][pokemonId] = 1;
    }
    return out;
  }

  function normHeader(s) {
    return String(s == null ? "" : s)
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim().replace(/\s+/g, " ");
  }

  /* Cabeçalhos da aba 1 -> chave interna. Mesma ordem da planilha do Gabriel. */
  const SHEET_COLUMNS = [
    ["Número", "num"], ["Nome", "namePt"], ["Registro", "caught"],
    ["M", "m"], ["N", "n"], ["F", "f"],
    ["Brilhante", "shiny"], ["Sombroso", "shadow"], ["Purificado", "purified"],
    ["Sombroso brilhante", "shadowShiny"], ["Dinamax", "dmax"],
    ["Dinamax brilhante", "dmaxShiny"], ["Dex brilhante", "shinyDex"],
    ["XXS", "xxs"], ["XXL", "xxl"], ["Sortudo", "lucky"], ["Perfeito", "perfect"],
    ["Estreia", "d_base"], ["Estreia brilhante", "d_shiny"],
    ["Estreia sombroso", "d_shadow"], ["Estreia sombroso brilhante", "d_shadowShiny"],
    ["Estreia dinamax", "d_dmax"], ["Estreia dinamax brilhante", "d_dmaxShiny"],
    ["Dex", "dexCanon"],
    ["Espécie", "speciesPt"], ["Variação regional", "regFormPt"],
    ["Forma alternativa", "altFormPt"], ["Traje", "costumePt"],
    ["Species", "speciesEn"], ["Name", "nameEn"], ["Regional Form", "regFormEn"],
    ["Alternate Form", "altFormEn"], ["Costume", "costumeEn"], ["Região", "region"],
    ["Megaevolução", "flag_mega"], ["Gigamax", "flag_gmax"],
    ["Não trocável", "flag_notrade"], ["Exclusivo", "flag_exclusive"],
    ["Regional", "flag_regional"], ["DiF. Sex.", "gender"],
    ["Lendário", "flag_legendary"], ["Mítico", "flag_mythical"],
    ["Ultracriatura", "flag_ultrabeast"], ["Paradoxo", "flag_paradox"],
    ["Pseudo-lendário", "flag_pseudo"], ["Inicial", "flag_starter"],
    ["Bebê", "flag_baby"], ["SomenteM", "flag_maleOnly"],
    ["SomenteF", "flag_femaleOnly"], ["SomenteN", "flag_genderless"], ["ID", "id"],
    /* Colunas do Living Dex — vêm DEPOIS do ID pra não mexer nas 51 colunas
       originais. Se você criar colunas com estes mesmos cabeçalhos na sua
       planilha-mestre, a importação lê as marcas de lá também. */
    ["Living dex", "living"], ["Living dex brilhante", "livingShiny"],
    ["Living dex sombroso", "livingShadow"],
    ["Living dex purificado", "livingPurified"],
    ["Living dex dinamax", "livingDmax"], ["Living dex sortudo", "livingLucky"]
  ];
  const HEADER_MAP = {};
  SHEET_COLUMNS.forEach(([h, k]) => { HEADER_MAP[h] = k; });

  const DATE_COL = { d_base: "base", d_shiny: "shiny", d_shadow: "shadow",
                     d_shadowShiny: "shadowShiny", d_dmax: "dmax",
                     d_dmaxShiny: "dmaxShiny" };

  /* ----------------------------------------------------------- write */
  /* Monta as linhas no mesmo formato da aba "PokéAgenda".
     blank=true: esqueleto puro, sem nenhuma marca — a "planilha em branco". */
  function buildRows(skeleton, blank) {
    const head = SHEET_COLUMNS.map(([h]) => h);
    const body = skeleton.entries.map(e => SHEET_COLUMNS.map(([, key]) => {
      if (key === "num") return e.num;
      if (key === "id") return e.id;
      if (key === "dexCanon") return e.dexCanon ? "Sim" : "";
      if (key === "gender") return e.gender || "";
      if (key.indexOf("flag_") === 0) {
        return e.flags.indexOf(key.slice(5)) !== -1 ? "Sim" : "";
      }
      if (DATE_COL[key]) {
        const d = e.debut[DATE_COL[key]];
        return d ? { date: d } : "";
      }
      if (MARK_ORDER.indexOf(key) !== -1) {
        return !blank && Store.has(e.id, key) ? "x" : "";
      }
      return e[key] == null ? "" : e[key];
    }));
    return { head, body };
  }

  /* ------------------------------------------------------ estilo/cores
     As mesmas cores das categorias do site (data/categories.json), pra
     quem preenche no Excel reconhecer de cara as mesmas cores do app e
     da aba Resumo da planilha original. Colunas fora deste mapa (nome,
     região, datas de estreia, marcadores…) são geradas pelo site e
     ganham um cabeçalho neutro escuro — sinal de "não precisa editar". */
  const MARK_COLOR = {
    caught: "1E9BD7",
    m: "7C5CD6", n: "7C5CD6", f: "7C5CD6",
    shiny: "E0A21B", shinyDex: "E0A21B",
    shadow: "7A4CC0", purified: "22AEBC", shadowShiny: "9B55CC",
    dmax: "C6317B", dmaxShiny: "DB5397",
    xxs: "8659C5", xxl: "3A6FB0", lucky: "EE7B22", perfect: "E14B62",
    living: "1E9BD7", livingShiny: "E0A21B", livingShadow: "7A4CC0",
    livingPurified: "22AEBC", livingDmax: "C6317B", livingLucky: "EE7B22"
  };
  const REF_COLOR = "3A4150";
  const BLOCKED_FILL = "E3E6EC";
  const BLOCKED_FONT = "9AA0AC";
  const headerColorFor = key => MARK_COLOR[key] || REF_COLOR;

  /* Monta xl/styles.xml e devolve os índices de estilo (xf) prontos pra
     usar nas duas abas — cabeçalho colorido por categoria, célula
     "bloqueada" (gênero impossível) e os estilos da aba de instruções. */
  function buildStyles() {
    const headerColors = Array.from(new Set(SHEET_COLUMNS.map(([, k]) => headerColorFor(k))));

    const fills = [
      `<fill><patternFill patternType="none"/></fill>`,
      `<fill><patternFill patternType="gray125"/></fill>`,
      ...headerColors.map(c =>
        `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`),
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${BLOCKED_FILL}"/><bgColor indexed="64"/></patternFill></fill>`
    ];
    const fillIdOf = {};
    headerColors.forEach((c, i) => { fillIdOf[c] = 2 + i; });
    const blockedFillId = fills.length - 1;

    const fonts = [
      `<font><sz val="11"/><name val="Calibri"/></font>`,
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,
      `<font><sz val="11"/><color rgb="FF${BLOCKED_FONT}"/><name val="Calibri"/></font>`,
      `<font><b/><sz val="18"/><color rgb="FF${REF_COLOR}"/><name val="Calibri"/></font>`,
      `<font><b/><sz val="12"/><color rgb="FF${REF_COLOR}"/><name val="Calibri"/></font>`
    ];

    const xfs = [
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,                    // 0 padrão
      `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` // 1 data
    ];
    const headerXf = {};
    for (const c of headerColors) {
      headerXf[c] = xfs.length;
      xfs.push(`<xf numFmtId="0" fontId="1" fillId="${fillIdOf[c]}" borderId="0" xfId="0" ` +
        `applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`);
    }
    const blockedXf = xfs.length;
    xfs.push(`<xf numFmtId="0" fontId="2" fillId="${blockedFillId}" borderId="0" xfId="0" ` +
      `applyFont="1" applyFill="1"/>`);
    const titleXf = xfs.length;
    xfs.push(`<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`);
    const subXf = xfs.length;
    xfs.push(`<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>`);
    const swatchXf = {};
    for (const c of headerColors) {
      swatchXf[c] = xfs.length;
      xfs.push(`<xf numFmtId="0" fontId="0" fillId="${fillIdOf[c]}" borderId="0" xfId="0" applyFill="1"/>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${fonts.length}">${fonts.join("")}</fonts>
<fills count="${fills.length}">${fills.join("")}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
</styleSheet>`;

    return { xml, headerXf, blockedXf, titleXf, subXf, swatchXf };
  }

  function xCell(ref, v, style) {
    if (v === "" || v == null) return style ? `<c r="${ref}" s="${style}"/>` : "";
    if (typeof v === "object" && v.date) return `<c r="${ref}" s="1"><v>${isoToSerial(v.date)}</v></c>`;
    const sAttr = style ? ` s="${style}"` : "";
    if (typeof v === "number") return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  /* Aba de dados: cabeçalho colorido por categoria; nas colunas M/N/F,
     células sem o gênero possível pra aquela espécie ganham o estilo
     "bloqueado" (mesmo espírito do trancamento na ficha do site). */
  function dataSheetXml(head, body, entries, styles) {
    const { headerXf, blockedXf } = styles;
    const mIdx = SHEET_COLUMNS.findIndex(([, k]) => k === "m");
    const nIdx = SHEET_COLUMNS.findIndex(([, k]) => k === "n");
    const fIdx = SHEET_COLUMNS.findIndex(([, k]) => k === "f");
    const genderAtCol = { [mIdx]: "m", [nIdx]: "n", [fIdx]: "f" };

    const rows = [];
    const headCells = head.map((v, i) =>
      xCell(colName(i) + "1", v, headerXf[headerColorFor(SHEET_COLUMNS[i][1])])).join("");
    rows.push(`<row r="1" customHeight="1" ht="30">${headCells}</row>`);

    body.forEach((b, i) => {
      const r = i + 2;
      const entry = entries[i];
      const allowed = Agg.allowedGenders(entry);
      const rowCells = b.map((v, ci) => {
        const g = genderAtCol[ci];
        const style = (g && allowed.indexOf(g) === -1) ? blockedXf : 0;
        return xCell(colName(ci) + r, v, style);
      }).join("");
      rows.push(`<row r="${r}">${rowCells}</row>`);
    });

    const lastCol = colName(head.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="2" max="2" width="30" customWidth="1"/><col min="18" max="23" width="13" customWidth="1"/><col min="51" max="51" width="16" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<autoFilter ref="A1:${lastCol}${body.length + 1}"/>
</worksheet>`;
  }

  /* Legenda: uma linha por coluna marcável, com o mesmo swatch de cor do
     cabeçalho dela na aba de dados — pra bater visualmente com o que a
     pessoa vê ao trocar de aba. */
  const LEGEND = [
    ["caught", "Registro", "Você tem este Pokémon registrado na Pokédex."],
    ["m", "M", "Você tem um macho registrado."],
    ["n", "N", "Você tem um exemplar sem gênero registrado."],
    ["f", "F", "Você tem uma fêmea registrada."],
    ["shiny", "Brilhante", "Você pegou um brilhante desta entrada específica."],
    ["shinyDex", "Dex brilhante", "Você já tem algum brilhante deste número na Pokédex (calculado — ajuste se precisar)."],
    ["shadow", "Sombroso", "Você tem este sombroso."],
    ["purified", "Purificado", "Você purificou este sombroso."],
    ["shadowShiny", "Sombroso brilhante", "Você tem este sombroso brilhante."],
    ["dmax", "Dinamax", "Você tem este em Dinamax."],
    ["dmaxShiny", "Dinamax brilhante", "Você tem este em Dinamax brilhante."],
    ["xxs", "XXS", "Menor tamanho já registrado desta entrada."],
    ["xxl", "XXL", "Maior tamanho já registrado desta entrada."],
    ["lucky", "Sortudo", "Você tem este sortudo."],
    ["perfect", "Perfeito", "Você tem este com 100% de IV."],
    ["living", "Living dex", "Você TEM este na caixa agora — diferente de só registrado."],
    ["livingShiny", "Living dex brilhante", "Brilhante na caixa agora."],
    ["livingShadow", "Living dex sombroso", "Sombroso na caixa agora."],
    ["livingPurified", "Living dex purificado", "Purificado na caixa agora."],
    ["livingDmax", "Living dex dinamax", "Dinamax na caixa agora."],
    ["livingLucky", "Living dex sortudo", "Sortudo na caixa agora."]
  ];

  function instructionsSheetXml(styles) {
    const { headerXf, titleXf, subXf, swatchXf } = styles;
    const rows = [];
    let r = 1;
    const add = cellsSpec => {
      const cs = cellsSpec.map(([col, val, style]) => xCell(colName(col) + r, val, style)).join("");
      rows.push(`<row r="${r}">${cs}</row>`);
      r++;
    };
    const skip = n => { r += (n || 1); };

    add([[0, "PokéAgenda — instruções de preenchimento", titleXf]]);
    skip();
    add([[0, "Marque as colunas coloridas com qualquer texto — o site usa \"x\" — para indicar que você tem aquele Pokémon ou aquela marca."]]);
    add([[0, "Colunas com cabeçalho cinza-escuro são geradas pelo site (nome, região, datas de estreia, marcadores…) e não precisam ser editadas."]]);
    add([[0, "Nas colunas M / N / F, uma célula cinza indica um gênero que não existe para aquele Pokémon — deixe em branco."]]);
    add([[0, "Não apague nem reordene a coluna ID: é ela que liga cada linha ao Pokémon certo na hora de importar."]]);
    skip();
    add([[0, "Legenda das colunas", subXf]]);
    skip();
    add([[0, "", headerXf[REF_COLOR]], [1, "Coluna", headerXf[REF_COLOR]], [2, "O que marcar", headerXf[REF_COLOR]]]);
    for (const [key, label, expl] of LEGEND) {
      const c = headerColorFor(key);
      add([[0, "", swatchXf[c]], [1, label], [2, expl]]);
    }
    add([[0, "", swatchXf[REF_COLOR]], [1, "Cabeçalho cinza-escuro"],
      [2, "Gerado pelo site a partir do esqueleto do jogo — nome, região, datas de estreia, marcadores etc. Não precisa editar."]]);
    skip();
    add([[0, "Depois de preencher", subXf]]);
    skip();
    add([[0, "Salve o arquivo e importe pela aba \"Meus dados\" do site — suas marcas substituem as que já estavam salvas neste navegador."]]);
    skip();
    add([[0, "A aba \"Fundos\" é separada: cada linha é um Pokémon elegível para um fundo de evento. Marque a coluna \"Marcado\" para o Pokémon que você pegou COM aquele fundo especificamente — o mesmo Pokémon pode aparecer marcado numa linha e não marcado em outra, já que o registro normal (\"Registro\") não distingue de qual captura veio."]]);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetFormatPr defaultRowHeight="16"/>
<cols><col min="1" max="1" width="4" customWidth="1"/><col min="2" max="2" width="26" customWidth="1"/><col min="3" max="3" width="85" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;
  }

  /* Aba "Fundos": uma linha por PAR (background, Pokémon elegível) -
     é N-pra-N, não cabe como coluna na aba principal (ver PLANS.md item 2).
     blank=true (planilha em branco) gera a aba com a coluna Marcado vazia. */
  function backgroundsSheetXml(styles, blank) {
    const { headerXf } = styles;
    const bgs = (typeof Agg !== "undefined" && Agg.backgrounds) || [];
    const head = BG_SHEET_COLUMNS.map(([h]) => h);
    const rows = [];
    const headCells = head.map((v, i) => {
      const key = BG_SHEET_COLUMNS[i][1];
      const color = key === "marked" ? headerColorFor("caught") : REF_COLOR;
      return xCell(colName(i) + "1", v, headerXf[color]);
    }).join("");
    rows.push(`<row r="1" customHeight="1" ht="30">${headCells}</row>`);

    let r = 2;
    for (const bg of bgs) {
      for (const p of bg.pokemon) {
        const entry = Agg.byId && Agg.byId.get(p.id);
        const marked = !blank && Store.hasBackgroundMark(bg.id, p.id) ? "x" : "";
        const vals = [
          bg.id, bg.name, bg.type === "special" ? "Especial" : "Presencial",
          p.id, entry ? (LANG === "en" ? (entry.nameEn || entry.namePt) : entry.namePt) : "",
          p.viaEvolution ? "Sim" : "", marked
        ];
        const cells = vals.map((v, ci) => xCell(colName(ci) + r, v)).join("");
        rows.push(`<row r="${r}">${cells}</row>`);
        r++;
      }
    }

    const lastCol = colName(head.length - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="2" width="26" customWidth="1"/><col min="5" max="5" width="24" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
<autoFilter ref="A1:${lastCol}${r - 1}"/>
</worksheet>`;
  }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  /* "Instruções" aparece primeiro (é a aba que abre), mas o arquivo físico
     sheet1.xml continua sendo o de dados — mantém o fallback de leitura
     (readSheet cai em sheet1.xml se não conseguir resolver pelo nome).
     "Fundos" vem por último, como aba opcional (arquivos antigos
     simplesmente não têm o rId4/sheet3.xml). */
  const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Instruções" sheetId="2" r:id="rId2"/><sheet name="PokéAgenda" sheetId="1" r:id="rId1"/><sheet name="Fundos" sheetId="3" r:id="rId4"/></sheets>
</workbook>`;

  const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>`;

  async function buildXlsx(skeleton, blank) {
    const { head, body } = buildRows(skeleton, blank);
    const styles = buildStyles();
    const enc = new TextEncoder();
    return Zip.write([
      { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
      { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
      { name: "xl/workbook.xml", data: enc.encode(WORKBOOK) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WB_RELS) },
      { name: "xl/styles.xml", data: enc.encode(styles.xml) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(dataSheetXml(head, body, skeleton.entries, styles)) },
      { name: "xl/worksheets/sheet2.xml", data: enc.encode(instructionsSheetXml(styles)) },
      { name: "xl/worksheets/sheet3.xml", data: enc.encode(backgroundsSheetXml(styles, blank)) }
    ]);
  }

  function buildCsv(skeleton) {
    const { head, body } = buildRows(skeleton);
    const cell = v => {
      if (v && typeof v === "object" && v.date) {
        const [y, m, d] = v.date.split("-"); return `${d}/${m}/${y}`;
      }
      const s = String(v == null ? "" : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.map(cell).join(";")];
    for (const r of body) lines.push(r.map(cell).join(";"));
    // BOM para o Excel abrir com acentos certos
    return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  }

  function buildJson(skeleton) {
    const marks = {};
    for (const e of skeleton.entries) {
      const on = MARK_ORDER.filter(k => Store.has(e.id, k));
      if (on.length) marks[e.id] = on;
    }
    return new Blob([JSON.stringify({
      app: "pokeagenda", v: 1,
      exported: new Date().toISOString(),
      skeletonGenerated: skeleton.generated,
      marks,
      /* dexes personalizadas viajam no backup (a planilha não as carrega) */
      customTiers: Store.customTiers,
      customMarks: Store.customMarks,
      /* dex de backgrounds tambem viaja aqui, alem da aba propria no .xlsx */
      backgroundMarks: Store.backgroundMarks
    }, null, 1)], { type: "application/json" });
  }

  function readJson(text, skeleton) {
    const o = JSON.parse(text);
    if (!o || !o.marks) throw new Error("Backup .json não reconhecido.");
    if (o.customTiers) {
      Store.customTiers = o.customTiers;
      Store.customMarks = o.customMarks || {};
    }
    if (o.backgroundMarks) Store.backgroundMarks = o.backgroundMarks;
    const known = new Set(skeleton.entries.map(e => e.id));
    const report = { matched: 0, unmatched: [], marks: 0, rows: Object.keys(o.marks).length };
    const rows = [];
    for (const id in o.marks) {
      if (!known.has(id)) {
        if (report.unmatched.length < 40) report.unmatched.push(id);
        continue;
      }
      report.matched++;
      const marks = {};
      for (const k of o.marks[id]) { marks[k] = true; report.marks++; }
      rows.push({ id, marks });
    }
    return { rows, report };
  }

  function readCsv(text, skeleton) {
    const clean = text.replace(/^﻿/, "");
    const delim = (clean.split("\n")[0].split(";").length >
                   clean.split("\n")[0].split(",").length) ? ";" : ",";
    const rows = [];
    let cur = [], field = "", q = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (q) {
        if (ch === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch !== "\r") field += ch;
    }
    if (field || cur.length) { cur.push(field); rows.push(cur); }
    return rowsToMarks(rows, skeleton);
  }

  return { readSheet, rowsToMarks, readJson, readCsv, backgroundRowsToMarks,
           buildXlsx, buildCsv, buildJson, SHEET_COLUMNS };
})();
