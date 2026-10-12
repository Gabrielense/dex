#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Atualiza os valores em cache da aba Resumo sem abrir o Excel.
Refreshes the Resumo sheet's cached values without opening Excel.

O check_resumo.py reproduz cada celula conferida do Resumo em modo "legacy"
(as mesmas regras das formulas). Quando a planilha e editada por script, o
Excel nao recalcula, e o cache fica velho. Este script grava os valores
"legacy" de hoje direto nessas celulas - as formulas ficam intactas, e o
Excel recalcula tudo de novo quando a planilha for aberta (fullCalcOnLoad).

Celulas marcadas em _knownSheetGaps (onde a planilha diverge de proposito)
nao sao tocadas.

Use SO depois de editar a planilha por script. Depois de salvar no Excel,
nao precisa: o proprio Excel ja deixou o cache certo.

Uso / Usage:
    python tools/refresh_resumo.py [caminho/para/PokeAgenda.xlsx]
"""

import json
import os
import re
import sys
import zipfile
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import check_resumo as cr  # noqa: E402
import openpyxl  # noqa: E402


def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def resumo_part(z):
    """Path of the Resumo worksheet inside the zip."""
    wb = z.read("xl/workbook.xml").decode("utf-8")
    rid = re.search(r'<sheet [^>]*name="%s"[^>]*r:id="([^"]+)"' % cr.SHEET_RESUMO, wb).group(1)
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    target = re.search(r'<Relationship [^>]*Id="%s"[^>]*Target="([^"]+)"' % rid, rels)
    if not target:
        target = re.search(r'<Relationship [^>]*Target="([^"]+)"[^>]*Id="%s"' % rid, rels)
    t = target.group(1).lstrip("/")
    return t if t.startswith("xl/") else "xl/" + t


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else cr.DEFAULT_XLSX
    with open(os.path.join(ROOT, "data", "categories.json"), encoding="utf-8") as fh:
        catdoc = json.load(fh)
    gaps = catdoc.get("_knownSheetGaps", {}).get("gaps", [])

    def known_gap(key, region, field):
        return any(g["category"] == key and region in g["regions"] and field in g["fields"] for g in gaps)

    rows = cr.load_rows(xlsx)
    ws = openpyxl.load_workbook(xlsx, data_only=True)[cr.SHEET_RESUMO]
    regions = {}
    for r in cr.RESUMO_REGION_ROWS:
        name = cr.txt(ws.cell(r, cr.RESUMO_REGION_COL).value)
        if name:
            regions[name] = r

    cr.AS_OF = date.today()
    values = {}  # "X12" -> int
    for cat in catdoc["categories"]:
        legacy = cr.aggregate(rows, cat, "legacy")
        for region, srow in regions.items():
            for field, col in cat.get("resumo", {}).items():
                if field in ("caught", "released", "total") and not known_gap(cat["key"], region, field):
                    values["%s%d" % (col_letter(col), srow)] = legacy.get(region, {}).get(field, 0)

    z = zipfile.ZipFile(xlsx)
    part = resumo_part(z)
    xml = z.read(part).decode("utf-8")
    changed = 0
    for ref, val in values.items():
        m = re.search(r'<c r="%s"(?: [^>]*?)?(/>|>(.*?)</c>)' % ref, xml, re.S)
        if not m or not m.group(2) or "<f" not in m.group(2):
            continue  # only refresh cells that hold a formula
        body = m.group(2)
        old = re.search(r"<v>(.*?)</v>", body)
        if old and old.group(1) == str(val):
            continue
        body2 = re.sub(r"<v>.*?</v>", "<v>%d</v>" % val, body) if old else body + "<v>%d</v>" % val
        attrs = re.sub(r'\s*t="[^"]*"', "", re.match(r'<c r="[^"]+"([^>]*?)/?>', m.group(0)).group(1))
        xml = xml[:m.start()] + '<c r="%s"%s>%s</c>' % (ref, attrs, body2) + xml[m.end():]
        changed += 1

    tmp = xlsx + ".tmp"
    with zipfile.ZipFile(tmp, "w") as out:
        for info in z.infolist():
            data = xml.encode("utf-8") if info.filename == part else z.read(info.filename)
            out.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED)
    z.close()
    os.replace(tmp, xlsx)
    print("Resumo: %d celula(s) atualizada(s) / cell(s) refreshed (de %d conferidas)" % (changed, len(values)))


if __name__ == "__main__":
    main()
