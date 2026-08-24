#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera data/evolutions.json: o grafo de evolucao de cada especie/forma que
existe em Pokemon GO. Fonte: pogoapi.net/api/v1/pokemon_evolutions.json
(derivado do Game Master do proprio jogo, entao so tem evolucoes que
EXISTEM no GO).
Generates data/evolutions.json: the evolution graph for every species/form
that exists in Pokemon GO. Source: pogoapi.net's pokemon_evolutions.json
(derived from GO's own Game Master, so it only has evolutions that EXIST
in GO).

Por que um grafo e nao so um mapa numero->numero:
  - Formas regionais evoluem dentro da propria forma (Rattata de Alola vira
    Raticate de Alola, nao o de Kanto) - "form" e parte da identidade do no.
  - Algumas evolucoes divergem a partir do MESMO no: Eevee -> 8 evolucoes;
    Rockruff comum -> Lycanroc Diurna OU Noturna; Toxel -> Toxtricity Aguda
    OU Grave. O grafo guarda todos os alvos, nao um so.
Why a graph and not just a number->number map:
  - Regional forms evolve within their own form (Alolan Rattata becomes
    Alolan Raticate, not the Kantonian one) - "form" is part of node identity.
  - Some evolutions branch from the SAME node: Eevee -> 8 evolutions;
    plain Rockruff -> Midday OR Midnight Lycanroc; Toxel -> Amped OR Low Key
    Toxtricity. The graph keeps every target, not just one.

Uso / Usage:
    python tools/build_evolutions.py [caminho/para/skeleton.json]
"""

import json
import os
import sys
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKELETON_PATH = os.path.join(ROOT, "data", "skeleton.json")
OUT_PATH = os.path.join(ROOT, "data", "evolutions.json")
SOURCE_URL = "https://pogoapi.net/api/v1/pokemon_evolutions.json"

# ------------------------------------------------------------ known noise
# Entradas de nivel superior da pogoapi que sao duplicatas historicas (o
# Slowpoke de Galar ja tem sua propria entrada "Galarian"; "2020" e um
# rotulo de evento redundante com a mesma evolucao). Ignoradas por inteiro.
# Top-level pogoapi entries that are historical duplicates (Galarian
# Slowpoke already has its own "Galarian" entry; "2020" is a redundant
# event-era label for the same evolution). Skipped entirely.
IGNORE_SOURCE_FORMS = {"2020", "Winter_2020"}

# Forma da pogoapi -> Variacao regional da planilha (regFormEn). So conta
# se a especie de destino realmente tiver essa variacao na planilha; senao
# cai no caso base (forma "").
# pogoapi form -> spreadsheet regional variant (regFormEn). Only applies if
# the target species actually HAS that variant in the sheet; otherwise
# falls back to the base case (form "").
REGIONAL_RAW_TO_SITE = {
    "Alola": "Alolan",
    "Galarian": "Galarian",
    "Hisuian": "Hisuian",
    "Paldea": "Paldean",
    # Darmanitan de Galar: a pogoapi marca o alvo da evolucao como
    # "Galarian_standard" (pra distinguir da forma Zen, que nao evolui).
    # Galarian Darmanitan: pogoapi tags the evolution TARGET as
    # "Galarian_standard" (to tell it apart from Zen form, which doesn't evolve).
    "Galarian_standard": "Galarian",
}

# Forma da pogoapi -> Forma alternativa da planilha (altFormEn), so para os
# poucos casos em que uma evolucao carrega/gera uma forma alternativa
# (curado a mao - a pogoapi muda o vocabulario de forma sem aviso).
# pogoapi form -> spreadsheet alt form (altFormEn), only for the handful of
# cases where an evolution carries/produces an alt form (hand-curated - the
# pogoapi vocabulary shifts without notice).
_PATTERN_FORMS = {
    "Archipelago": "Archipelago", "Continental": "Continental",
    "Elegant": "Elegant", "Fancy": "Fancy", "Garden": "Garden",
    "High_plains": "High Plains", "Icy_snow": "Icy Snow", "Jungle": "Jungle",
    "Marine": "Marine", "Meadow": "Meadow", "Modern": "Modern",
    "Monsoon": "Monsoon", "Ocean": "Ocean", "Pokeball": "Poké Ball",
    "Polar": "Polar", "River": "River", "Sandstorm": "Sandstorm",
    "Savanna": "Savanna", "Sun": "Sun", "Tundra": "Tundra",
}
ALT_FORM_ALIASES = {
    (412, "Plant"): "Plant Cloak", (412, "Sandy"): "Sandy Cloak",
    (412, "Trash"): "Trash Cloak",
    (413, "Plant"): "Plant Cloak", (413, "Sandy"): "Sandy Cloak",
    (413, "Trash"): "Trash Cloak",
    (421, "Overcast"): "Overcast Form", (421, "Sunny"): "Sunshiny Form",
    (422, "East_sea"): "East Sea", (422, "West_sea"): "West Sea",
    (423, "East_sea"): "East Sea", (423, "West_sea"): "West Sea",
    (585, "Autumn"): "Autumn Form", (585, "Spring"): "Spring Form",
    (585, "Summer"): "Summer Form", (585, "Winter"): "Winter Form",
    (586, "Autumn"): "Autumn Form", (586, "Spring"): "Spring Form",
    (586, "Summer"): "Summer Form", (586, "Winter"): "Winter Form",
    (669, "Blue"): "Blue Flower", (669, "Orange"): "Orange Flower",
    (669, "Red"): "Red Flower", (669, "White"): "White Flower",
    (669, "Yellow"): "Yellow Flower",
    (670, "Blue"): "Blue Flower", (670, "Orange"): "Orange Flower",
    (670, "Red"): "Red Flower", (670, "White"): "White Flower",
    (670, "Yellow"): "Yellow Flower",
    (671, "Blue"): "Blue Flower", (671, "Orange"): "Orange Flower",
    (671, "Red"): "Red Flower", (671, "White"): "White Flower",
    (671, "Yellow"): "Yellow Flower",
    (681, "Shield"): "Shield Forme",
    (710, "Average"): "Medium", (710, "Large"): "Large",
    (710, "Small"): "Small", (710, "Super"): "Jumbo",
    (711, "Average"): "Medium", (711, "Large"): "Large",
    (711, "Small"): "Small", (711, "Super"): "Jumbo",
    (744, "Dusk"): "Own Tempo",
    (745, "Dusk"): "Dusk Form", (745, "Midday"): "Midday Form",
    (745, "Midnight"): "Midnight Form",
    (849, "Amped"): "Amped", (849, "Low_key"): "Low Key",
    (854, "Antique"): "Antique", (854, "Phony"): "Phony",
    (855, "Antique"): "Antique", (855, "Phony"): "Phony",
    (892, "Single_strike"): "Single Strike",
    (892, "Rapid_strike"): "Rapid Strike",
    (925, "Family_of_four"): "Family of Four",
    (925, "Family_of_three"): "Family of Three",
    (982, "Two"): "Two-Segment Form", (982, "Three"): "Three-Segment Form",
    (1012, "Artisan"): "Artisan", (1012, "Counterfeit"): "Counterfeit",
    (1013, "Masterpiece"): "Masterpiece",
    (1013, "Unremarkable"): "Unremarkable",
}
for _num in (664, 665, 666):  # Scatterbug / Spewpa / Vivillon - mesmos padroes
    for _raw, _site in _PATTERN_FORMS.items():
        ALT_FORM_ALIASES[(_num, _raw)] = _site

# Campos de requisito da pogoapi que valem a pena guardar (contexto de como
# chegar la - util quando a busca por pre-evolucao apontar "precisa de item X").
# pogoapi requirement fields worth keeping (context on how to get there -
# useful once the pre-evolution search points to "needs item X").
REQUIREMENT_FIELDS = [
    ("item_required", "item"),
    ("lure_required", "lure"),
    ("gender_required", "genderRequired"),
    ("buddy_distance_required", "buddyKm"),
    ("must_be_buddy_to_evolve", "buddyRequired"),
    ("only_evolves_in_daytime", "daytimeOnly"),
    ("only_evolves_in_nighttime", "nighttimeOnly"),
]


def load_skeleton(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    reg_forms, alt_forms, names, valid_pairs = {}, {}, {}, set()
    for e in data["entries"]:
        num = e["num"]
        if e["regFormEn"]:
            reg_forms.setdefault(num, set()).add(e["regFormEn"])
        if e["altFormEn"]:
            alt_forms.setdefault(num, set()).add(e["altFormEn"])
        names.setdefault(num, e["speciesEn"] or e["nameEn"])
        valid_pairs.add((num, e["regFormEn"] or e["altFormEn"] or ""))
    return reg_forms, alt_forms, names, valid_pairs


def fetch_source(url):
    print("Baixando / Downloading: %s" % url)
    req = urllib.request.Request(url, headers={"User-Agent": "pokeagenda-build-evolutions"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8-sig"))


def resolve_form(num, raw_form, reg_forms, alt_forms):
    """pogoapi form -> (form da planilha, tipo) respeitando o que a planilha
    realmente tem para esse numero. form da planilha -> (sheet form, type),
    honoring what the sheet actually has for that number."""
    site_reg = REGIONAL_RAW_TO_SITE.get(raw_form)
    if site_reg and site_reg in reg_forms.get(num, ()):
        return site_reg, "region"
    site_alt = ALT_FORM_ALIASES.get((num, raw_form))
    if site_alt and site_alt in alt_forms.get(num, ()):
        return site_alt, "alt"
    return "", ""


def node_key(num, form):
    return "%d|%s" % (num, form)


def main():
    skeleton_path = sys.argv[1] if len(sys.argv) > 1 else SKELETON_PATH
    if not os.path.exists(skeleton_path):
        sys.exit("skeleton.json nao encontrado / not found:\n  %s\n"
                  "Rode tools/export_skeleton.py primeiro." % skeleton_path)
    reg_forms, alt_forms, site_names, valid_pairs = load_skeleton(skeleton_path)

    try:
        raw = fetch_source(SOURCE_URL)
    except Exception as exc:  # rede indisponivel, DNS, etc.
        sys.exit("Falha ao baixar a fonte / failed to download source:\n  %s\n"
                  "  %r" % (SOURCE_URL, exc))

    nodes = {}  # node_key -> node dict
    unknown_nums = set()

    def get_node(num, form, name_en):
        key = node_key(num, form)
        node = nodes.get(key)
        if node is None:
            node = {
                "num": num, "form": form,
                "nameEn": site_names.get(num, name_en),
                # Normalmente 1 elemento. Mais de um so quando fontes
                # diferentes acabam na MESMA forma de destino (ex.: Mothim
                # nao tem manto, entao os 3 mantos de Burmy convergem nele).
                # Usually 1 element. More than one only when different
                # sources land on the SAME target form (e.g. Mothim has no
                # cloak, so all 3 Burmy cloaks converge on it).
                "evolvesFrom": [],
                "evolvesTo": [],
            }
            nodes[key] = node
            if num not in site_names:
                unknown_nums.add(num)
        return node

    edges_seen = set()  # (fromKey, toKey) - a pogoapi repete a mesma evolucao
                         # em entradas duplicadas (ex.: Frillish M/F); dedupe.
    for entry in raw:
        if entry["form"] in IGNORE_SOURCE_FORMS:
            continue
        src_num = entry["pokemon_id"]
        src_form, _ = resolve_form(src_num, entry["form"], reg_forms, alt_forms)
        src = get_node(src_num, src_form, entry["pokemon_name"])

        for ev in entry["evolutions"]:
            dst_num = ev["pokemon_id"]
            dst_form, _ = resolve_form(dst_num, ev["form"], reg_forms, alt_forms)
            dst = get_node(dst_num, dst_form, ev["pokemon_name"])

            edge_id = (node_key(src_num, src_form), node_key(dst_num, dst_form))
            if edge_id in edges_seen:
                continue
            edges_seen.add(edge_id)

            requires = {}
            for src_field, out_key in REQUIREMENT_FIELDS:
                if src_field in ev:
                    requires[out_key] = ev[src_field]

            to_entry = {"num": dst_num, "form": dst_form}
            if requires:
                to_entry["requires"] = requires
            src["evolvesTo"].append(to_entry)

            from_entry = {"num": src_num, "form": src_form}
            if from_entry not in dst["evolvesFrom"]:
                dst["evolvesFrom"].append(from_entry)

    chain_list = sorted(nodes.values(), key=lambda n: (n["num"], n["form"]))

    # Casos em que a pogoapi nao diz qual sub-forma sai da evolucao (o jogo
    # deixa a escolha pro jogador - item RKS do Silvally, sabor do Alcremie)
    # e a planilha nao tem uma linha "base" pra esse numero. O no fica com
    # form='' mesmo assim (util pro nivel de numero), so documentado aqui.
    # Cases where pogoapi doesn't say which sub-form comes out of the
    # evolution (the game leaves it to the player - Silvally's RKS item,
    # Alcremie's flavor) and the sheet has no "base" row for that number.
    # The node keeps form='' anyway (useful at the number level), just
    # documented here.
    unmatched = [
        {"num": n["num"], "form": n["form"], "nameEn": n["nameEn"]}
        for n in chain_list
        if n["num"] in site_names and (n["num"], n["form"]) not in valid_pairs
    ]

    out = {
        "generated": datetime.now().replace(microsecond=0).isoformat(),
        "source": SOURCE_URL,
        "_doc": {
            "pt": "Grafo de evolucao (num+form -> lista de num+form). form e "
                  "sempre um regFormEn ou altFormEn EXATO de data/skeleton.json, "
                  "ou '' quando a evolucao nao depende de forma. Formas sem "
                  "correspondente na planilha (temporarias, cosmeticas, notacao "
                  "interna da pogoapi) ja foram achatadas para ''. evolvesFrom "
                  "e uma lista porque fontes diferentes as vezes convergem no "
                  "mesmo alvo (ex.: os 3 mantos de Burmy viram o mesmo Mothim).",
            "en": "Evolution graph (num+form -> list of num+form). form is "
                  "always an EXACT regFormEn or altFormEn from data/skeleton.json, "
                  "or '' when the evolution doesn't depend on form. Forms with no "
                  "counterpart in the sheet (temporary, cosmetic, pogoapi-internal "
                  "notation) are already flattened to ''. evolvesFrom is a list "
                  "because different sources sometimes converge on the same "
                  "target (e.g. all 3 Burmy cloaks become the same Mothim).",
        },
        "chains": chain_list,
        "_formIndeterminate": unmatched,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"), indent=None)

    branches = [n for n in chain_list if len(n["evolvesTo"]) > 1]
    convergences = [n for n in chain_list if len(n["evolvesFrom"]) > 1]
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print("OK -> %s (%.0f KB)" % (OUT_PATH, size_kb))
    print("   nos/nodes: %d | arestas/edges: %d | divergencias/branches: %d | "
          "convergencias/merges: %d"
          % (len(chain_list), len(edges_seen), len(branches), len(convergences)))
    if branches:
        print("   ex. divergencias / e.g. branches:")
        for n in branches[:6]:
            targets = ", ".join("%d%s" % (t["num"], ("(%s)" % t["form"]) if t["form"] else "")
                                 for t in n["evolvesTo"])
            print("     %s -> %s" % (n["nameEn"], targets))
    if convergences:
        print("   ex. convergencias / e.g. merges:")
        for n in convergences[:6]:
            sources = ", ".join("%d%s" % (f["num"], ("(%s)" % f["form"]) if f["form"] else "")
                                 for f in n["evolvesFrom"])
            print("     %s <- %s" % (n["nameEn"], sources))
    if unknown_nums:
        print("   AVISO: numeros sem correspondencia em skeleton.json (mantidos "
              "mesmo assim): %s" % ", ".join(str(n) for n in sorted(unknown_nums)))
    if unmatched:
        print("   AVISO: sub-forma nao determinavel pela evolucao, sem linha "
              "'base' na planilha (mantido como form='', ver _formIndeterminate):")
        for u in unmatched:
            print("     %s (num %d)" % (u["nameEn"], u["num"]))


if __name__ == "__main__":
    main()
