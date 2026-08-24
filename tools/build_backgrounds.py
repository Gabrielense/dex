#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera data/backgrounds.json: os backgrounds (planos de fundo colecionaveis)
de Pokemon GO e quais Pokemon (por ID do esqueleto) cada um aceita.
Generates data/backgrounds.json: Pokemon GO's collectible summary-page
backgrounds and which Pokemon (by skeleton ID) each one accepts.

Fonte / Source: pokemongo.fandom.com/wiki/Backgrounds, via a API MediaWiki
do Fandom (a pagina normal bloqueia scraping, mas o endpoint action=parse
devolve o wikitext limpo):
    https://pokemongo.fandom.com/api.php?action=parse&page=Backgrounds&prop=wikitext

Como funciona / How it works:
  1. Baixa o wikitext e faz o parse manual das tabelas wiki (rowspan
     inclusive - varios backgrounds reaparecem em eventos diferentes ao
     longo dos anos, tudo na MESMA linha da tabela via rowspan).
     Downloads the wikitext and hand-parses the wiki tables (rowspan
     included - several backgrounds recur across different events over the
     years, all on the SAME table row via rowspan).
  2. Cada background e identificado pelo NOME DO ARQUIVO da imagem (nao
     pelo texto exibido - o mesmo texto "Los Angeles, California" e usado
     por duas imagens/backgrounds diferentes em anos diferentes).
     Each background is identified by the image FILENAME (not the display
     text - the same text "Los Angeles, California" is used by two
     different images/backgrounds in different years).
  3. Cada Pokemon do template {{I|Nome||ci=Forma|70px}} e casado com uma
     entrada do esqueleto por especie + costume/forma (ci=), com fallback
     difuso (normaliza e compara por substring) quando o texto do wiki nao
     bate exatamente com costumeEn/regFormEn/altFormEn.
     Each {{I|Name||ci=Form|70px}} Pokemon is matched to a skeleton entry by
     species + costume/form (ci=), with a fuzzy fallback (normalize and
     compare by substring) when the wiki text doesn't exactly match
     costumeEn/regFormEn/altFormEn.
  4. Para entradas SEM fantasia, expande a lista seguindo data/evolutions.json
     PARA FRENTE (o background acompanha o Pokemon quando ele evolui),
     respeitando a forma do no. Fantasias ficam de fora da expansao -
     evoluir a especie lisa nao garante a fantasia (mesma regra do item 1
     de PLANS.md).
     For entries WITHOUT a costume, expands the list FORWARD through
     data/evolutions.json (the background follows the Pokemon when it
     evolves), respecting node form. Costumes are excluded from expansion -
     evolving the plain species doesn't guarantee the costume (same rule as
     PLANS.md item 1).

Uso / Usage:
    python tools/build_backgrounds.py [--test]
    --test: mostra um resumo e near-misses, mas NAO grava backgrounds.json.
            shows a summary and near-misses, but does NOT write backgrounds.json.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKELETON_PATH = os.path.join(ROOT, "data", "skeleton.json")
EVO_PATH = os.path.join(ROOT, "data", "evolutions.json")
OUT_PATH = os.path.join(ROOT, "data", "backgrounds.json")
API_URL = ("https://pokemongo.fandom.com/api.php"
           "?action=parse&page=Backgrounds&prop=wikitext&format=json")
FILEPATH_BASE = "https://pokemongo.fandom.com/wiki/Special:FilePath/"

ROWSPAN_RE = re.compile(r'^rowspan="(\d+)"\s*\|(.*)$', re.DOTALL)
FILE_RE = re.compile(r'\[\[File:([^|\]]+)')
POKEMON_TPL_RE = re.compile(r'\{\{I\|([^|}]+)\|\|(?:ci=([^|}]+)\|)?[^}]*\}\}')

SECTION_SPECIAL = "==List of Special Backgrounds=="
SECTION_LOCATION = "==List of Location Backgrounds=="
SECTION_END_MARKERS = ["==Unused==", "==Trivia==", "==References=="]


# ------------------------------------------------------------------ fetch
def fetch_wikitext():
    print("Baixando / Downloading: %s" % API_URL)
    req = urllib.request.Request(API_URL, headers={"User-Agent": "pokeagenda-build-backgrounds"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["parse"]["wikitext"]["*"]


# -------------------------------------------------------------- wikitext
def clean_wikitext(s):
    """Texto legivel a partir de wikitext cru: derruba templates, links e
    tags comuns. Human-readable text from raw wikitext: drops templates,
    links and common tags."""
    s = re.sub(r"\{\{Nth\|(\d+)\}\}", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[File:[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>", " · ", s, flags=re.I)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ·").strip()
    return s


NAME_PREFIX_RE = re.compile(
    r"^(Location Background|Location Card|Special Background)[\s_]+", re.I)


def name_from_filename(filename):
    """Ultimo recurso quando a celula do background nao tem texto (existe -
    algumas linhas novas do wiki chegam so com a imagem). Last resort for
    when the background cell has no text (it happens - some new wiki rows
    arrive with only the image)."""
    base = re.sub(r"\.(png|jpg|jpeg|gif)$", "", filename, flags=re.I)
    base = base.replace("_", " ")
    base = NAME_PREFIX_RE.sub("", base)
    return base.strip()


def bg_display_name(bg_cell, filename):
    without_file = re.sub(r"\[\[File:[^\]]*\]\]", "", bg_cell)
    cleaned = clean_wikitext(without_file)
    first = cleaned.split(" · ")[0].strip()
    return first or cleaned or name_from_filename(filename)


def slugify(filename):
    base = re.sub(r"\.(png|jpg|jpeg|gif)$", "", filename, flags=re.I)
    base = base.strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    return base.strip("-")


def extract_section(full_text, start_marker, end_markers):
    i = full_text.find(start_marker)
    if i == -1:
        return ""
    i += len(start_marker)
    end = len(full_text)
    for m in end_markers:
        j = full_text.find(m, i)
        if j != -1:
            end = min(end, j)
    return full_text[i:end]


def iter_year_blocks(section_text):
    parts = re.split(r"\n===\s*(\d{4})\s*===\n", "\n" + section_text)
    for k in range(1, len(parts), 2):
        year = int(parts[k])
        text = parts[k + 1] if k + 1 < len(parts) else ""
        yield year, text


def find_tables(block_text):
    """Blocos de linhas de cada tabela wiki de nivel 1 (ignora tabelas
    aninhadas dentro de uma celula - viram uma so celula la na frente).
    Line-blocks for each top-level wiki table (nested tables inside a cell
    are ignored here - they get flattened into a single cell downstream)."""
    lines = block_text.split("\n")
    tables = []
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("{|"):
            depth = 1
            j = i + 1
            body = []
            while j < len(lines) and depth > 0:
                s = lines[j].strip()
                if s.startswith("{|"):
                    depth += 1
                elif s == "|}" or s.startswith("|}"):
                    depth -= 1
                body.append(lines[j])
                j += 1
            tables.append(body)
            i = j
        else:
            i += 1
    return tables


def parse_table(lines):
    """Linhas de UMA tabela (a partir da linha de abertura '{|' inclusive)
    -> lista de linhas fisicas, cada uma uma lista de celulas cruas na
    ORDEM em que apareceram (rowspan ainda nao resolvido - ver
    resolve_columns). Tabelas aninhadas dentro de uma celula viram texto
    simples dessa celula.
    Lines of ONE table (starting at the opening '{|' line inclusive) ->
    list of physical rows, each a list of raw cells in ENCOUNTER order
    (rowspan not resolved yet - see resolve_columns). Tables nested inside
    a cell get flattened into that cell's plain text."""
    rows = []
    cur_row = []
    cur_cell = None
    depth = 0
    for raw_line in lines:
        s = raw_line.strip()
        if depth > 0:
            if s.startswith("{|"):
                depth += 1
            elif s == "|}" or s.startswith("|}"):
                depth -= 1
            else:
                piece = s.lstrip("|")
                cur_cell = (cur_cell or "") + " " + piece
            continue
        if s.startswith("{|"):
            depth = 1
            continue
        if s == "|}":
            if cur_cell is not None:
                cur_row.append(cur_cell)
                cur_cell = None
            if cur_row:
                rows.append(cur_row)
            break
        if s.startswith("|-"):
            if cur_cell is not None:
                cur_row.append(cur_cell)
                cur_cell = None
            if cur_row:
                rows.append(cur_row)
            cur_row = []
            continue
        if s.startswith("!"):
            continue
        if s.startswith("|"):
            if cur_cell is not None:
                cur_row.append(cur_cell)
            cur_cell = s[1:]
            continue
        if cur_cell is not None:
            cur_cell += "\n" + s
    return rows


def resolve_columns(raw_rows, ncols=3):
    """Aplica rowspan por posicao de coluna -> lista de [bg, pokemon, evento]
    por linha logica. Applies rowspan per column position -> list of
    [bg, pokemon, event] per logical row."""
    pending = {}  # col -> [remaining, content]
    out = []
    for raw_cells in raw_rows:
        row_out = [None] * ncols
        ri = 0
        for col in range(ncols):
            if col in pending and pending[col][0] > 0:
                row_out[col] = pending[col][1]
                pending[col][0] -= 1
                if pending[col][0] == 0:
                    del pending[col]
                continue
            if ri < len(raw_cells):
                cell = raw_cells[ri]
                ri += 1
                m = ROWSPAN_RE.match(cell)
                if m:
                    n = int(m.group(1))
                    content = m.group(2)
                    row_out[col] = content
                    if n > 1:
                        pending[col] = [n - 1, content]
                else:
                    row_out[col] = cell
            else:
                row_out[col] = ""
        out.append(row_out)
    return out


# --------------------------------------------------------------- skeleton
def load_skeleton():
    with open(SKELETON_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def load_evolutions():
    with open(EVO_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def build_species_index(entries):
    idx = {}
    for e in entries:
        idx.setdefault(e["speciesEn"], []).append(e)
    return idx


def build_numform_index(entries):
    """(num, form) -> entradas SEM fantasia com essa forma (0, 1 ou 2 - o 2
    e o par M/F com o mesmo num+form). Mega e Gigamax ficam de fora: nao sao
    resultado de evolucao por doce, sao um estado a parte (Energia
    Mega/particulas Max) que qualquer exemplar do numero pode alcancar,
    independente de ter vindo de um background ou nao - nao tem "debut"
    ligado a uma linhagem especifica.
    (num, form) -> entries WITHOUT a costume at that form (0, 1, or 2 - the
    2 case is the M/F pair sharing the same num+form). Mega and Gigantamax
    are excluded: they aren't a candy-evolution outcome, they're a separate
    state (Mega Energy/Max particles) any specimen of that number can reach
    regardless of whether it came from a background - it has no "debut"
    tied to a specific lineage."""
    idx = {}
    for e in entries:
        if e.get("costumeEn"):
            continue
        flags = e.get("flags") or []
        if "mega" in flags or "gmax" in flags:
            continue
        key = (e["num"], e.get("regFormEn") or e.get("altFormEn") or "")
        idx.setdefault(key, []).append(e)
    return idx


def build_evo_index(evo_data):
    idx = {}
    for n in evo_data.get("chains", []):
        idx[(n["num"], n["form"])] = n
    return idx


# Apelidos do Fandom para o texto de costumeEn/altFormEn/regFormEn da
# planilha, aplicados so no lado do "hint" (nunca no lado do esqueleto).
# Fandom shorthand for the sheet's costumeEn/altFormEn/regFormEn wording,
# applied only to the "hint" side (never to the skeleton side).
HINT_ALIASES = {"worlds": "worldchampionships"}

# Prefixos regionais que o Fandom as vezes cola no NOME em vez de mandar
# via ci= (ex.: "Alolan Vulpix" em vez de "Vulpix" + ci="Vulpix alolan").
# Regional prefixes Fandom sometimes glues onto the NAME instead of
# sending via ci= (e.g. "Alolan Vulpix" instead of "Vulpix" + ci="Vulpix alolan").
REGIONAL_NAME_PREFIXES = ["Alolan", "Galarian", "Hisuian", "Paldean"]


def norm(s):
    s = re.sub(r"[^a-z0-9]", "", s.lower())
    for k, v in HINT_ALIASES.items():
        s = s.replace(k, v)
    return s


def match_costume(species_name, ci_raw, candidates):
    hint = ci_raw.strip()
    if hint.lower().startswith(species_name.lower()):
        hint = hint[len(species_name):].strip()
    hint_n = norm(hint)
    if not hint_n:
        return None
    for field in ("costumeEn", "regFormEn", "altFormEn"):
        for e in candidates:
            if e.get(field) and norm(e[field]) == hint_n:
                return e
    best, best_len = None, None
    for field in ("costumeEn", "regFormEn", "altFormEn"):
        for e in candidates:
            v = e.get(field)
            if not v:
                continue
            vn = norm(v)
            if hint_n in vn or vn in hint_n:
                if best is None or len(vn) < best_len:
                    best, best_len = e, len(vn)
    return best


def match_pokemon(name, ci_raw, by_species):
    candidates = by_species.get(name)
    if not candidates:
        # Fandom as vezes cola o prefixo regional no NOME em vez do ci=
        # (ver REGIONAL_NAME_PREFIXES). Tenta de novo sem o prefixo,
        # tratando-o como se fosse a forma pedida.
        for prefix in REGIONAL_NAME_PREFIXES:
            if name.startswith(prefix + " "):
                bare = name[len(prefix) + 1:]
                candidates = by_species.get(bare)
                if candidates:
                    name = bare
                    if not ci_raw:
                        ci_raw = prefix
                    break
        if not candidates:
            return None, "species-not-found"
    if ci_raw:
        m = match_costume(name, ci_raw, candidates)
        if m:
            return m, None
        return None, "costume-not-found:%s" % ci_raw
    base = [e for e in candidates
            if not e.get("costumeEn") and not e.get("regFormEn") and not e.get("altFormEn")]
    if base:
        canon = [e for e in base if e.get("dexCanon")]
        return (canon[0] if canon else base[0]), None
    canon = [e for e in candidates if e.get("dexCanon")]
    if canon:
        return canon[0], None
    return candidates[0], None


def expand_forward(num, form, evo_idx):
    key = (num, form)
    seen = {key}
    out = []
    stack = [key]
    while stack:
        k = stack.pop()
        node = evo_idx.get(k)
        if not node:
            continue
        for t in node.get("evolvesTo", []):
            k2 = (t["num"], t.get("form", ""))
            if k2 in seen:
                continue
            seen.add(k2)
            out.append(k2)
            stack.append(k2)
    return out


# ------------------------------------------------------------------ main
def main():
    is_test = "--test" in sys.argv

    skeleton = load_skeleton()
    entries = skeleton["entries"]
    by_species = build_species_index(entries)
    numform_idx = build_numform_index(entries)
    evo_idx = build_evo_index(load_evolutions())

    try:
        wikitext = fetch_wikitext()
    except Exception as exc:
        sys.exit("Falha ao baixar a fonte / failed to download source:\n  %r" % exc)

    backgrounds = {}       # bg_id -> dict
    unmatched = []         # (bg_id, pk_name, ci, reason)

    def get_bg(bg_id, filename, name, type_, year):
        bg = backgrounds.get(bg_id)
        if bg is None:
            bg = {
                "id": bg_id, "type": type_, "name": name,
                "image": FILEPATH_BASE + urllib.parse.quote(filename),
                "year": year, "events": [], "pokemon": {},
            }
            backgrounds[bg_id] = bg
        elif year < bg["year"]:
            bg["year"] = year
        return bg

    sections = [
        ("special", SECTION_SPECIAL, [SECTION_LOCATION] + SECTION_END_MARKERS),
        ("location", SECTION_LOCATION, SECTION_END_MARKERS),
    ]
    for type_, start_marker, end_markers in sections:
        section_text = extract_section(wikitext, start_marker, end_markers)
        for year, block_text in iter_year_blocks(section_text):
            for table_lines in find_tables(block_text):
                raw_rows = parse_table(table_lines)
                for bg_cell, pokemon_cell, event_cell in resolve_columns(raw_rows):
                    m = FILE_RE.search(bg_cell or "")
                    if not m:
                        continue
                    filename = m.group(1).strip()
                    bg_id = slugify(filename)
                    name = bg_display_name(bg_cell, filename)
                    event_text = clean_wikitext(event_cell or "")
                    bg = get_bg(bg_id, filename, name, type_, year)
                    if event_text and event_text not in bg["events"]:
                        bg["events"].append(event_text)

                    for pk_name, ci in POKEMON_TPL_RE.findall(pokemon_cell or ""):
                        entry, err = match_pokemon(pk_name, ci.strip(), by_species)
                        if not entry:
                            unmatched.append((bg_id, pk_name, ci, err))
                            continue
                        if entry["id"] not in bg["pokemon"]:
                            bg["pokemon"][entry["id"]] = {
                                "id": entry["id"], "num": entry["num"], "viaEvolution": False
                            }
                        if not entry.get("costumeEn"):
                            form = entry.get("regFormEn") or entry.get("altFormEn") or ""
                            for (tnum, tform) in expand_forward(entry["num"], form, evo_idx):
                                for te in numform_idx.get((tnum, tform), []):
                                    if te["id"] not in bg["pokemon"]:
                                        bg["pokemon"][te["id"]] = {
                                            "id": te["id"], "num": te["num"], "viaEvolution": True
                                        }

    out_list = []
    for bg in backgrounds.values():
        b2 = dict(bg)
        b2["pokemon"] = sorted(bg["pokemon"].values(), key=lambda p: p["num"])
        out_list.append(b2)
    out_list.sort(key=lambda b: (b["type"], b["year"], b["name"]))

    out = {
        "generated": datetime.now().replace(microsecond=0).isoformat(),
        "source": API_URL,
        "_doc": {
            "pt": "Backgrounds (planos de fundo colecionaveis) de Pokemon GO. "
                  "id = nome do arquivo de imagem no Fandom, normalizado (e o "
                  "identificador estavel - o texto exibido as vezes se repete "
                  "entre backgrounds diferentes). pokemon[].viaEvolution=true "
                  "significa que a entrada nao apareceu na tabela do Fandom - "
                  "foi adicionada porque uma entrada listada evolui pra ela "
                  "(data/evolutions.json), respeitando a forma. Fantasias "
                  "(costumeEn preenchido) nunca geram expansao por evolucao.",
            "en": "Pokemon GO's collectible summary-page backgrounds. id = the "
                  "Fandom image filename, normalized (the stable identifier - "
                  "the displayed text sometimes repeats across different "
                  "backgrounds). pokemon[].viaEvolution=true means the entry "
                  "wasn't in the Fandom table - it was added because a listed "
                  "entry evolves into it (data/evolutions.json), respecting "
                  "form. Costumes (costumeEn set) never trigger evolution "
                  "expansion.",
        },
        "backgrounds": out_list,
    }

    total_pokemon = sum(len(b["pokemon"]) for b in out_list)
    n_special = sum(1 for b in out_list if b["type"] == "special")
    n_location = sum(1 for b in out_list if b["type"] == "location")
    print("Backgrounds: %d especiais/special, %d de local/location, %d vinculos pokemon/pokemon links"
          % (n_special, n_location, total_pokemon))

    if unmatched:
        by_reason = {}
        for bg_id, pk_name, ci, err in unmatched:
            by_reason.setdefault(err, []).append("%s (%s)%s" % (pk_name, bg_id, (" ci=" + ci) if ci else ""))
        print("\nAVISO: %d entradas de Pokemon nao casaram com o esqueleto / "
              "did not match the skeleton:" % len(unmatched))
        for reason, items in sorted(by_reason.items()):
            print("  %s (%d):" % (reason, len(items)))
            for it in items[:15]:
                print("    " + it)
            if len(items) > 15:
                print("    ... e mais %d / and %d more" % (len(items) - 15, len(items) - 15))

    if is_test:
        print("\n--- TEST MODE: 3 primeiros backgrounds / first 3 backgrounds ---")
        print(json.dumps(out_list[:3], indent=2, ensure_ascii=False))
        print("\nNada foi gravado (--test). / Nothing was written (--test).")
        return

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print("\nOK -> %s (%.0f KB)" % (OUT_PATH, size_kb))


if __name__ == "__main__":
    main()
