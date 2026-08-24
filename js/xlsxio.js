/* Leitura e escrita de .xlsx no navegador, sem bibliotecas.
   Read/write .xlsx in the browser, no libraries.

   Importar: só precisamos da coluna ID + as colunas de marcas. Datas de
   estreia vêm do esqueleto, então são ignoradas na importação (mas a gente
   avisa se a planilha do usuário parece mais nova que o esqueleto).
   Exportar: uma aba só, com a mesma ordem de colunas da aba "PokéAgenda". */

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

  /* ------------------------------------------------------------ read */
  async function readSheet(arrayBuffer, preferSheetName) {
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
      let pick = sheets.find(s => s.getAttribute("name") === preferSheetName) || sheets[0];
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

  function sheetXml(head, body) {
    const rows = [];
    const cells = (vals, r) => vals.map((v, i) => {
      const ref = colName(i) + r;
      if (v === "" || v == null) return "";
      if (typeof v === "object" && v.date) {
        return `<c r="${ref}" s="1"><v>${isoToSerial(v.date)}</v></c>`;
      }
      if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");

    rows.push(`<row r="1">${cells(head, 1)}</row>`);
    body.forEach((b, i) => rows.push(`<row r="${i + 2}">${cells(b, i + 2)}</row>`));

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

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="PokéAgenda" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  /* estilo 1 = data dd/mm/aaaa (numFmtId 14) */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

  async function buildXlsx(skeleton, blank) {
    const { head, body } = buildRows(skeleton, blank);
    const enc = new TextEncoder();
    return Zip.write([
      { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
      { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
      { name: "xl/workbook.xml", data: enc.encode(WORKBOOK) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WB_RELS) },
      { name: "xl/styles.xml", data: enc.encode(STYLES) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml(head, body)) }
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
      customMarks: Store.customMarks
    }, null, 1)], { type: "application/json" });
  }

  function readJson(text, skeleton) {
    const o = JSON.parse(text);
    if (!o || !o.marks) throw new Error("Backup .json não reconhecido.");
    if (o.customTiers) {
      Store.customTiers = o.customTiers;
      Store.customMarks = o.customMarks || {};
    }
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

  return { readSheet, rowsToMarks, readJson, readCsv,
           buildXlsx, buildCsv, buildJson, SHEET_COLUMNS };
})();
