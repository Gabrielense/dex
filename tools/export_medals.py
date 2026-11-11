#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera data/medals.json a partir da aba "Medalhas" da planilha PokeAgenda.
Generates data/medals.json from the PokeAgenda spreadsheet's "Medalhas" sheet.

Só o esqueleto público sai daqui: nomes das medalhas e seus máximos (platina),
medalhas de evento (nome, data, local) e desafios de coleção (nome, data).
NENHUM progresso pessoal (valores, tiers, "x", "Pago"...) é exportado - o site
lê isso da planilha do usuário no navegador (js/medals.js + js/xlsxio.js).
Only the public skeleton leaves here: medal names and platinum thresholds,
event medals (name, date, place) and Elite Collector challenges (name, date).
NO personal progress is exported - the site reads that from the user's own
spreadsheet, in the browser.

A aba tem três tabelas lado a lado / three side-by-side tables:
  A-E  medalhas normais: Nome | <valor> | Máximo | Progresso | Medalha
       (a partir da 2a linha "Nome da Medalha" vêm as medalhas de tipo)
  H-K  medalhas de evento: Nome | Status | Lançamento | Descrição
  M-P  Colecionador de elite: Nome | Data | Status | Registro

Uso / Usage:
    python3 tools/export_medals.py [caminho/para/PokeAgenda.xlsx]
"""
import json
import os
import sys
import warnings
from datetime import date, datetime

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl nao encontrado. Rode: pip install openpyxl")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_XLSX = os.path.abspath(os.path.join(ROOT, "..", "PokéAgenda 2026.xlsx"))
OUT_PATH = os.path.join(ROOT, "data", "medals.json")
SHEET = "Medalhas"

# Nomes em inglês das medalhas (os do jogo). Sem entrada = o site mostra o PT.
# English medal names (the game's). No entry = the site shows the PT name.
NAME_EN = {
    "Melhor Companheiro": "Best Buddy", "Campeão": "Champion", "Ultra-herói": "Ultra Hero",
    "Paldea": "Paldea", "Wayfarer": "Wayfarer", "Galar": "Galar", "Jovem": "Youngster",
    "Hisui": "Hisui", "Alola": "Alola", "Unown": "Unown", "Sinnoh": "Sinnoh", "Corredor": "Jogger",
    "Kanto": "Kanto", "Colecionador": "Collector", "Cientista": "Scientist",
    "Criador de Pokémon": "Breeder", "Mochileiro": "Backpacker", "Excursionista": "Pokémon Ranger",
    "Pescador": "Fisher", "Lutadora": "Battle Girl", "Treinador Ás": "Ace Trainer",
    "Fã de Pikachu": "Pikachu Fan", "Johto": "Johto", "Lenda das Batalhas": "Battle Legend",
    "Mestre das Frutas": "Berry Master", "Líder de Ginásio": "Gym Leader", "Hoenn": "Hoenn",
    "Pokémon Ranger": "Pokémon Ranger", "Estrela": "Idol", "Cavalheiro": "Gentleman",
    "Piloto": "Pilot", "Veterano da Grande Liga": "Great League Veteran",
    "Veterano da Ultra-liga": "Ultra League Veteran", "Veterano da Liga mestra": "Master League Veteran",
    "Fotógrafo": "Cameraman", "Unova": "Unova", "Purificador": "Purifier", "Herói": "Hero",
    "Kalos": "Kalos", "Triatleta": "Triathlete", "Em ascensão": "Rising Star",
    "Dupla em ascensão": "Rising Star Duo", "Fã de piquenique": "Picnicker", "Sucessor": "Successor",
    "Guru da Megaevolução": "Mega Evolution Guru", "Especialista de Reide": "Raid Expert",
    "Navegante Profissional": "Expert Navigator",
    "Colecionador de Pokémon pequeninos": "Tiny Pokémon Collector",
    "Colecionador de Pokémon gigantes": "Jumbo Pokémon Collector",
    "Colecionador de Vivillon": "Vivillon Collector", "Estrela da Vitrine": "Showcase Star",
    # medalhas de tipo / type medals
    "Estudante": "Schoolkid", "Faixa Preta": "Black Belt", "Ornitólogo": "Bird Keeper",
    "Rebelde": "Punk Girl", "Maníaco da Ruína": "Ruin Maniac", "Montanhista": "Hiker",
    "Caça-inseto": "Bug Catcher", "Maníaco de Feitiços": "Hex Maniac", "Ateador de Fogo": "Kindler",
    "Nadador": "Swimmer", "Jardineiro": "Gardener", "Agente Ferroviário": "Rail Staff",
    "Roqueiro": "Rocker", "Médium": "Psychic", "Esquiador": "Skier", "Domador de dragão": "Dragon Tamer",
    "Delinquente": "Delinquent", "Garota de Contos": "Fairy Tale Girl",
}
TIERS = ["Bronze", "Prata", "Ouro", "Platina"]


def txt(v):
    return "" if v is None else str(v).strip()


def iso(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = txt(v)
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    if not os.path.exists(xlsx):
        sys.exit("Planilha nao encontrada / spreadsheet not found:\n  %s" % xlsx)
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)
    if SHEET not in wb.sheetnames:
        sys.exit("Aba '%s' nao existe. Abas: %s" % (SHEET, wb.sheetnames))
    ws = wb[SHEET]
    rows = list(ws.iter_rows(values_only=True))

    standard, event, elite = [], [], []
    group = "general"
    seen = set()
    for r in rows[1:]:
        r = list(r) + [None] * 17
        # --- medalhas normais (A..E)
        name = txt(r[0])
        if name == "Nome da Medalha":
            group = "type"           # segunda tabela: medalhas de tipo
        elif name:
            mx = r[2]
            if isinstance(mx, (int, float)):
                key = name
                if key in seen:
                    print("AVISO: medalha repetida / duplicate medal:", name)
                seen.add(key)
                standard.append({"id": key, "namePt": name, "nameEn": NAME_EN.get(name, name),
                                 "max": mx, "group": group})
        # --- medalhas de evento (H..K)
        ename = txt(r[7])
        if ename and ename != "Nome da Medalha de Evento":
            d = iso(r[9])
            event.append({"id": "%s|%s" % (ename, d or ""), "name": ename, "date": d, "place": txt(r[10])})
        # --- Colecionador de elite (M..P)
        cname = txt(r[12])
        if cname and cname != "Colecionador de elite":
            d = iso(r[13])
            elite.append({"id": "%s|%s" % (cname, d or ""), "name": cname, "date": d})

    dup_ev = [e["id"] for e in event if sum(x["id"] == e["id"] for x in event) > 1]
    dup_el = [e["id"] for e in elite if sum(x["id"] == e["id"] for x in elite) > 1]
    out = {
        "generated": datetime.now().replace(microsecond=0).isoformat(),
        "source": os.path.basename(xlsx),
        "tiers": TIERS,
        "_doc": {
            "pt": "Esqueleto das medalhas (sem progresso pessoal). standard: medalhas com máximo = valor da platina, group general|type. event: medalhas de evento (id = nome|data). elite: desafios de coleção do Colecionador de Elite (id = nome|data). As marcas pessoais vivem no navegador (js/medals.js) e viajam na aba Medalhas do .xlsx e no backup .json.",
            "en": "Medal skeleton (no personal progress). standard: medals with max = platinum value, group general|type. event: event medals (id = name|date). elite: Elite Collector collection challenges (id = name|date). Personal marks live in the browser (js/medals.js) and travel in the .xlsx 'Medalhas' sheet and the .json backup."
        },
        "standard": standard, "event": event, "elite": elite,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("OK -> %s" % OUT_PATH)
    print("   medalhas/medals: %d (%d gerais + %d de tipo) | evento/event: %d | elite: %d"
          % (len(standard), sum(m["group"] == "general" for m in standard),
             sum(m["group"] == "type" for m in standard), len(event), len(elite)))
    if dup_ev or dup_el:
        print("AVISO: ids repetidos (mesmo nome e data) - o site nao distingue / duplicate ids:", dup_ev, dup_el)
    missing_en = [m["namePt"] for m in standard if m["namePt"] not in NAME_EN]
    if missing_en:
        print("sem nome em inglês (fica o PT) / no English name:", ", ".join(missing_en))


if __name__ == "__main__":
    main()
