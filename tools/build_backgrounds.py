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
  4. Expande a lista seguindo data/evolutions.json PARA FRENTE (o background
     acompanha o Pokemon quando ele evolui), respeitando a forma do no.
     Entradas SEM fantasia expandem livremente (mesma regra do item 1 de
     PLANS.md). Entradas COM fantasia só continuam a cadeia enquanto a
     MESMA fantasia existir na proxima etapa (ex.: Eevee "Explorer" evolui
     pras 8 eeveelutions "Explorer" - isso existe de verdade no jogo,
     confirmado olhando data/skeleton.json) - na maioria dos casos a
     fantasia simplesmente nao existe la e a cadeia para, que e o
     comportamento default esperado (ver build_costume_index).
     Expands the list FORWARD through data/evolutions.json (the background
     follows the Pokemon when it evolves), respecting node form. Entries
     WITHOUT a costume expand freely (same rule as PLANS.md item 1).
     Entries WITH a costume only continue the chain while the SAME costume
     exists at the next stage (e.g. Eevee "Explorer" evolves into all 8
     eeveelutions "Explorer" - this really exists in the game, confirmed by
     checking data/skeleton.json) - in most cases the costume simply
     doesn't exist there and the chain stops, which is the expected default
     (see build_costume_index).

  5. `namePt` vem de um dicionario curado a mao (NAME_PT); `debut` e a
     primeira data reconhecida no texto dos eventos (ISO, ordena a lista);
     `regionExclusive` marca "Special" que na pratica so saem numa regiao.
     MANUAL_OVERRIDES corrige nome/imagem pontuais quando o Fandom tem
     texto cru ou arte errada/provisoria.
     `namePt` comes from a hand-curated dictionary (NAME_PT); `debut` is
     the first recognized date in the event text (ISO, sorts the list);
     `regionExclusive` flags "Special" backgrounds that in practice only
     came from one region. MANUAL_OVERRIDES fixes one-off name/image
     issues when Fandom has raw placeholder text or wrong/provisional art.

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

ROWSPAN_RE = re.compile(r'^rowspan\s*=\s*"(\d+)"\s*\|(.*)$', re.DOTALL)
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
    # pula pedacos vazios ou so-hifen (sobra de linhas "|-" de tabelas
    # aninhadas achatadas em texto - ver parse_table) ate achar algo real.
    # skips empty or dash-only pieces (leftover from nested-table "|-" row
    # separators flattened into text - see parse_table) until something real.
    for piece in cleaned.split(" · "):
        piece = piece.strip()
        if piece and not re.fullmatch(r"[-–—\s]*", piece):
            return piece
    return name_from_filename(filename)


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


def build_costume_index(entries):
    """texto do costumeEn -> {(num, form): [entradas]}. Uma fantasia como
    "Explorer" existe em varias especies (Eevee E TODAS AS EEVEELUTIONS,
    por exemplo) - isso e o que permite reconhecer "esta fantasia continua
    depois da evolucao" sem precisar de uma lista escrita a mao por
    especie. Lista (nao entrada unica) porque um par M/F pode compartilhar
    o mesmo (num, form).
    costumeEn text -> {(num, form): [entries]}. A costume like "Explorer"
    exists across several species (Eevee AND ALL its eeveelutions, for
    example) - that's what lets us recognize "this costume survives the
    evolution" without a hand-written per-species list. List (not a single
    entry) because an M/F pair can share the same (num, form)."""
    idx = {}
    for e in entries:
        c = e.get("costumeEn")
        if not c:
            continue
        key = (e["num"], e.get("regFormEn") or e.get("altFormEn") or "")
        idx.setdefault(c, {}).setdefault(key, []).append(e)
    return idx


def expand_forward_costume(num, form, costume_en, evo_idx, costume_idx):
    """Igual expand_forward, mas só segue uma aresta quando o alvo da
    evolução tem uma entrada com a MESMA fantasia (costumeEn idêntico) -
    a fantasia é o que autoriza continuar a cadeia (Sylveon com fantasia
    "Explorer" resolvida checa se Eevee "Explorer" -> Sylveon "Explorer"
    existe; se a próxima etapa não tiver a fantasia, a cadeia para ali,
    igual à regra geral de que fantasia não garante fantasia).
    Same as expand_forward, but only follows an edge when the evolution
    target has an entry with the SAME costume (identical costumeEn) - the
    costume is what authorizes continuing the chain (checks whether Eevee
    "Explorer" -> Sylveon "Explorer" exists; if the next stage doesn't
    have the costume, the chain stops there, same general rule that a
    costume isn't guaranteed to survive evolution)."""
    by_key = costume_idx.get(costume_en, {})
    seen = {(num, form)}
    out = []
    stack = [(num, form)]
    while stack:
        n, f = stack.pop()
        node = evo_idx.get((n, f))
        if not node:
            continue
        for t in node.get("evolvesTo", []):
            k2 = (t["num"], t.get("form", ""))
            if k2 in seen or k2 not in by_key:
                continue
            seen.add(k2)
            out.append(k2)
            stack.append(k2)
    return out


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
    """-> (lista de entradas, erro). A lista tem mais de um item quando o
    Fandom nao especifica genero (ci_raw vazio) e a especie tem um par
    macho/femea com diferenca visual como entradas BASE separadas (ex.:
    Pikachu 0025 x 0025+F) - o template {{I|Pikachu||70px}} nao diz qual
    dos dois, entao os dois contam (mesma logica ja usada pra alvo de
    evolucao em build_numform_index/expand_forward).
    -> (list of entries, error). The list has more than one item when
    Fandom doesn't specify gender (empty ci_raw) and the species has a
    visually-different male/female pair as separate BASE entries (e.g.
    Pikachu 0025 vs 0025+F) - the {{I|Pikachu||70px}} template doesn't say
    which one, so both count (same logic already used for evolution
    targets in build_numform_index/expand_forward)."""
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
            return [m], None
        return None, "costume-not-found:%s" % ci_raw
    # Um "{{I|Pikachu||70px}}" sem ci= nunca quer dizer Mega/Gigamax -
    # mesma regra de build_numform_index (nao e resultado de evolucao,
    # nem de uma captura comum; estado a parte, sem "debut" de linhagem).
    # A plain "{{I|Pikachu||70px}}" with no ci= never means Mega/Gigantamax
    # - same rule as build_numform_index (not an evolution outcome, nor a
    # regular catch; a separate state with no lineage "debut").
    plain = [e for e in candidates
             if "mega" not in (e.get("flags") or []) and "gmax" not in (e.get("flags") or [])]
    base = [e for e in plain
            if not e.get("costumeEn") and not e.get("regFormEn") and not e.get("altFormEn")]
    if base:
        canon = [e for e in base if e.get("dexCanon")]
        if canon:
            # o resto do par (ex. a linha +F, que normalmente nao e
            # dexCanon) tambem entra quando existir.
            rest = [e for e in base if e not in canon]
            return canon + rest, None
        return base, None
    canon = [e for e in plain if e.get("dexCanon")]
    if canon:
        return canon, None
    if plain:
        return [plain[0]], None
    return [candidates[0]], None


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


# ---------------------------------------------------------------- datas
# Extrai a primeira data (mes+dia, ano opcional) de um texto de evento ja
# limpo por clean_wikitext, ex. "Triumph Together · August 23 - 30" ou
# "Road to Kalos · February 23 - February 27, 2026". Quando o texto nao
# tem ano explicito, usa o ano da secao (===YYYY=== de onde a linha veio).
# Extracts the first date (month+day, optional year) from an event text
# already cleaned by clean_wikitext, e.g. "Triumph Together · August 23 -
# 30" or "Road to Kalos · February 23 - February 27, 2026". When the text
# has no explicit year, uses the section year (===YYYY=== the row came from).
MONTH_NUM = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11,
    "December": 12,
}
_MONTHS_ALT = "|".join(MONTH_NUM)
EVENT_DATE_RE = re.compile(
    r"(?P<month>" + _MONTHS_ALT + r")\s+(?P<day>\d{1,2})"
    r"(?:\s*-\s*(?:(?:" + _MONTHS_ALT + r")\s+)?\d{1,2})?"
    r"(?:,\s*(?P<year>\d{4}))?"
)


def parse_event_date(event_text, fallback_year):
    m = EVENT_DATE_RE.search(event_text or "")
    if not m:
        return None
    year = int(m.group("year")) if m.group("year") else fallback_year
    month = MONTH_NUM[m.group("month")]
    day = int(m.group("day"))
    try:
        return "%04d-%02d-%02d" % (year, month, day)
    except ValueError:
        return None


def earliest_debut(events, fallback_year):
    dates = [d for d in (parse_event_date(e, fallback_year) for e in events) if d]
    return min(dates) if dates else None


# --------------------------------------------------------- curadoria manual
# Traducoes em PT, curadas a mao (o texto em ingles vem direto da tabela do
# Fandom - nomes proprios de time/versao/temporada nao tem traducao
# automatica confiavel). Cobre os 150 backgrounds catalogados em 2026-08-24;
# o que faltar cai no fallback (mesmo nome em ingles) e aparece no aviso
# final do script, pra curar quando sair background novo.
# PT translations, hand-curated (the English text comes straight from
# Fandom's table - team/version/season proper names don't have a reliable
# automatic translation). Covers the 150 backgrounds catalogued as of
# 2026-08-24; anything missing falls back to the English name and shows up
# in the script's final warning, to curate when a new background appears.
NAME_PT = {
    # ---- location ----
    "location-card-barcelona": "Barcelona, Espanha",
    "location-card-jeju": "Ilha de Jeju, Coreia do Sul",
    "location-card-las-vegas": "Las Vegas, EUA",
    "location-card-london": "Londres, Reino Unido",
    "location-card-mexico-city": "Cidade do México, México",
    "location-card-nyc": "Nova York, EUA",
    "location-card-osaka": "Osaka, Japão",
    "location-card-seoul": "Seul, Coreia do Sul",
    "location-card-bali": "Bali, Indonésia",
    "location-background-fukuoka": "Fukuoka, Japão",
    "location-background-hong-kong": "Hong Kong, China",
    "location-background-honolulu": "Honolulu, Havaí, EUA",
    "location-background-incheon": "Incheon, Coreia do Sul",
    "location-background-jakarta": "Jacarta, Indonésia",
    "location-background-mlb-miami-marlins": "LoanDepot Park, Miami, Flórida, EUA",
    "location-card-los-angeles": "Los Angeles, Califórnia",
    "location-card-madrid": "Madri, Espanha",
    "location-card-nyc-2024": "Nova York, EUA",
    "location-card-sendai": "Sendai, Japão",
    "location-card-surabaya": "Surabaya, Indonésia",
    "location-background-s-o-paulo": "São Paulo, Brasil",
    "location-background-mlb-seattle-mariners": "T-Mobile Park, Seattle, Washington, EUA",
    "location-card-tainan": "Tainan, Taiwan",
    "location-card-yogyakarta": "Yogyakarta, Indonésia",
    "location-background-pokelid-fukuoka": "Fukuoka, Japão",
    "location-background-mlb-milwaukee-brewers": "American Family Field, Milwaukee, Wisconsin, EUA",
    "location-background-city-safari-amsterdam": "Amsterdã, Holanda",
    "location-background-anaheim": "Anaheim, Califórnia, EUA",
    "location-background-city-safari-bangkok": "Bangkok, Tailândia",
    "location-background-road-trip-2025-berlin": "Berlim, Alemanha",
    "location-background-city-safari-buenos-aires": "Buenos Aires, Argentina",
    "location-background-city-safari-cancun": "Cancún, Quintana Roo, México",
    "location-background-mlb-arizona-diamondbacks": "Chase Field, Phoenix, Arizona, EUA",
    "location-background-mlb-new-york-mets": "Citi Field, Nova York, EUA",
    "location-background-road-trip-2025-cologne": "Colônia, Alemanha",
    "location-background-mlb-boston-red-sox": "Fenway Park, Boston, Massachusetts, EUA",
    "location-background-mlb-texas-rangers": "Globe Life Field, Arlington, Texas, EUA",
    "location-background-jangheung-water-festival": "Condado de Jangheung, Coreia do Sul",
    "location-background-jeju-island-stamp-rally": "Ilha de Jeju, Coreia do Sul",
    "location-background-jersey-city": "Jersey City, Nova Jersey, EUA",
    "location-background-road-trip-2025-london": "Londres, Reino Unido",
    "location-background-los-angeles": "Los Angeles, Califórnia",
    "location-background-road-trip-2025-manchester": "Manchester, Inglaterra",
    "location-background-city-safari-miami": "Miami, Flórida, EUA",
    "location-background-milan": "Milão, Itália",
    "location-background-mumbai": "Mumbai, Índia",
    "location-background-wild-area-nagasaki": "Nagasaki, Kyushu, Japão",
    "location-background-mlb-washington-nationals": "Nationals Park, Washington, D.C., EUA",
    "location-background-new-taipei-city": "Nova Taipé, Taiwan",
    "location-background-mlb-san-francisco-giants": "Oracle Park, São Francisco, Califórnia, EUA",
    "location-background-mlb-baltimore-orioles": "Oriole Park at Camden Yards, Baltimore, Maryland, EUA",
    "location-background-osaka-gofest-2025": "Osaka, Japão",
    "location-background-expo2025-starters": "Osaka, Kansai, Japão",
    "location-background-expo2025-pikachu": "Osaka, Kansai, Japão",
    "location-background-paris": "Paris, França",
    "location-background-road-trip-2025-paris": "Paris, França",
    "location-background-paris-2025": "Paris, França",
    "location-background-paris-2025-2": "Paris, França",
    "location-background-mlb-cleveland-guardians": "Progressive Field, Cleveland, Ohio, EUA",
    "location-background-mlb-chicago-white-sox": "Rate Field, Chicago, Illinois, EUA",
    "location-background-sajik-baseball-stadium": "Estádio de Beisebol de Sajik, Busan, Coreia do Sul",
    "location-background-santiago": "Santiago, Chile",
    "location-background-singapore": "Singapura",
    "location-background-springblossom2025": "Coreia do Sul",
    "location-background-nfl-arizona-cardinals": "State Farm Stadium, Glendale, Arizona, EUA",
    "location-background-mlb-tampa-bay-rays": "Steinbrenner Field, Tampa, Flórida, EUA",
    "location-background-osaka-2025": "Suita, Osaka, Japão",
    "location-background-city-safari-sydney": "Sydney, Austrália",
    "location-background-taipei-childrens-amusement-park":
        "Parque de Diversões Infantil Municipal de Taipé, Taiwan",
    "location-background-mlb-minnesota-twins": "Target Field, Minneapolis, Minnesota, EUA",
    "location-background-road-trip-2025-hague": "Haia, Holanda",
    "location-background-road-trip-2025-valencia": "Valência, Espanha",
    "location-background-city-safari-valencia": "Valência, Espanha",
    "location-background-city-safari-vancouver": "Vancouver, Colúmbia Britânica, Canadá",
    "location-background-pokelid-aichi": "Aichi, Japão",
    "location-background-national-trust-anglesey-abbey": "Anglesey Abbey, Cambridgeshire, Reino Unido",
    "location-background-go-fest-2026-chicago": "Chicago, Illinois, EUA",
    "location-background-national-trust-cliveden": "Cliveden, Buckinghamshire, Reino Unido",
    "location-background-cologne": "Colônia, Alemanha",
    "location-background-go-fest-2026-copenhagen": "Copenhague, Dinamarca",
    "location-background-national-trust-dunham-massey": "Dunham Massey, Grande Manchester, Reino Unido",
    "location-background-id-car-free-day": "Jacarta, Indonésia",
    "location-background-national-trust-killerton": "Killerton, Devon, Reino Unido",
    "location-background-los-angeles-2026": "Los Angeles, Califórnia, EUA",
    "location-background-npb-2026-chunichi-dragons": "NPB 2026 Chunichi Dragons",
    "location-background-npb-2026-hiroshima-carp": "NPB 2026 Hiroshima Carp",
    "location-background-npb-2026-hokkaido-fighters": "NPB 2026 Hokkaido Fighters",
    "location-background-npb-2026-koshien-hanshin-tigers": "NPB 2026 Koshien Hanshin Tigers",
    "location-background-npb-2026-softbank-hawks": "NPB 2026 Softbank Hawks",
    "location-background-pokemon-park":
        "PokéPark KANTO no Parque de Diversões Yomiuriland, em Inagi, Tóquio, Japão",
    "location-background-pokemoncenter-golab": "Laboratório Pokémon GO",
    "location-background-pyeongchang-winter-festival": "Pyeongchang, Coreia do Sul",
    "location-background-npb-2026-rakuten-eagles": "Rakuten Mobile Park Miyagi, Sendai, Japão",
    "location-background-rio-de-janeiro": "Rio de Janeiro, Brasil",
    "location-background-san-francisco": "São Francisco, Califórnia, EUA",
    "location-background-mlb-tampa-bay-rays-2": "Steinbrenner Field, Tampa, Flórida, EUA",
    "location-background-tainan-2026": "Tainan, Taiwan",
    "location-background-taipei-floral-picnic-2026": "Taipé, Taiwan",
    "location-background-nyc-2026": "Times Square, Nova York, EUA",
    "location-background-tokmun-koto": "TokMun Koto",
    "location-background-tokmun-minato": "TokMun Minato",
    "location-background-tokmun-shinagawa": "TokMun Shinagawa",
    "location-background-npb-2026-yomiuri-giants": "Tokyo Dome, Tóquio, Japão",
    "location-background-go-fest-2026-tokyo": "Tóquio, Japão",
    "location-background-npb-2026-yokohama-stadium": "Estádio de Yokohama, Naka-ku, Yokohama, Japão",
    "location-background-npb-2026-zozo-marine": "ZOZO Marine Stadium, Chiba, Japão",
    # ---- special ----
    "special-background-deccd2024": "Dia Comunitário de Dezembro de 2024",
    "special-background-gofest2024-radiance": "Pokémon GO Fest 2024: Radiância",
    "special-background-gofest2024-umbra": "Pokémon GO Fest 2024: Umbra",
    "special-background-gofest2024-wormhole": "Pokémon GO Fest 2024: Buraco de Minhoca",
    "special-background-gofest2024-wormhole-moon": "Pokémon GO Fest 2024: Buraco de Minhoca da Lua",
    "special-background-gofest2024-wormhole-sun": "Pokémon GO Fest 2024: Buraco de Minhoca do Sol",
    "special-background-gowildarea2024": "Pokémon GO Área Selvagem 2024",
    "special-background-instinct": "Equipe Instinto",
    "special-background-mystic": "Equipe Sabedoria",
    "special-background-valor": "Equipe Valor",
    "special-background-9th-anniversary": "9º Aniversário",
    "special-background-blackversion": "Versão Preta",
    "special-background-greyversion": "Fusão Preto e Branco",
    "special-background-delightfuldays": "Temporada de Dias Encantadores",
    "special-background-dualdestiny": "Temporada Destino Duplo",
    "special-background-enigma": "Enigma",
    "special-background-mightandmastery": "Temporada Força e Maestria",
    "special-background-observatory-exhibition-tour": "Observatório Astronômico Pokémon",
    "special-background-concierge": "Pokémon Concierge",
    "special-background-gofest-2025": "Pokémon GO Fest 2025: Antigos Recuperados",
    "special-background-max-finale": "Pokémon GO Fest 2025: Final Max",
    "special-background-wild-area-global-2025": "Pokémon GO Área Selvagem 2025",
    "special-background-gofest-2025-shield": "Versão Escudo",
    "special-background-gofest-2025-sword": "Versão Espada",
    "special-background-tales-of-transformation": "Temporada Contos de Transformação",
    "special-background-whiteversion": "Versão Branca",
    "special-background-10th-anniversary": "10º Aniversário",
    "special-background-10th-anniversary-mewtwo": "10º Aniversário",
    "special-background-community-2026": "Dias Comunitários de 2026",
    "special-background-arraia-2026": "Arraiá 2026",
    "special-background-diamond": "Versão Diamante",
    "special-background-festival-of-colors-2026": "Festival das Cores 2026",
    "special-background-gold": "Versão Ouro",
    "special-background-lego": "LEGO",
    "special-background-mega": "Mega Evolução",
    "special-background-pearl": "Versão Pérola",
    "special-background-pokopia": "Pokémon Pokopia",
    "special-background-ruby": "Versão Rubi",
    "special-background-sapphire": "Versão Safira",
    "special-background-silver": "Versão Prata",
    "special-background-x": "Versão X",
    "special-background-y": "Versão Y",
}

# Sobrescreve nome (as vezes nos dois idiomas) e/ou imagem quando o texto
# ou a imagem que o Fandom tem no momento nao servem - curado a mao, caso a
# caso, com a fonte da correcao anotada.
# Overrides name (sometimes in both languages) and/or image when what
# Fandom currently has isn't good enough - hand-curated, case by case, with
# the source of the fix noted.
MANUAL_OVERRIDES = {
    # A celula do Fandom so tem "Special Background for Mewtwo during
    # Pokémon GO Fest 2026: Global" (o proprio texto de referencia da
    # imagem, nao um nome de verdade) e a imagem hospedada la ainda nao e
    # a arte final. leekduck.com/gofest/special-backgrounds confirma a
    # arte correta. Pedido pelo Gabriel em 2026-08-24.
    # The Fandom cell only has "Special Background for Mewtwo during
    # Pokémon GO Fest 2026: Global" (the image's own placeholder caption,
    # not a real name) and the image hosted there isn't the final art yet.
    # leekduck.com/gofest/special-backgrounds confirms the correct art.
    # Requested by Gabriel on 2026-08-24.
    "special-background-go-fest-2026-mewtwo": {
        "name": "GO Fest Global DNA",
        "namePt": "GO Fest Global DNA",
        "image": "https://cdn.leekduck.com/assets/img/events/article-images/"
                  "2026/2026-07-11-pokemon-go-fest-2026-global/mewtwo-special-background.jpg",
    },
    # Mesmo problema de nome cru (o texto da celula e literalmente
    # "[[Pokémon GO Fest 2026: Global]]: Raid Background") - a linha
    # inteira linka pro evento "Road of Legends", que e o nome de verdade.
    # Same raw-name problem (the cell text is literally "[[Pokémon GO Fest
    # 2026: Global]]: Raid Background") - the row links to the "Road of
    # Legends" event, which is the actual name.
    "special-background-road-of-legends": {
        "name": "Road of Legends",
        "namePt": "Caminho das Lendas",
    },
    # A imagem do Fandom pra esse background nao presta (card generico).
    # Usa a arte real de serebii.net/pokemongo/locationcard/th/communityday2026.jpg,
    # recortada uma vez (abaixo do "X" de marca d'agua, acima da barra
    # preta inferior) e commitada em assets/backgrounds/ - um hotlink
    # sempre serviria a imagem INTEIRA, sem o recorte. Pedido pelo Gabriel
    # em 2026-08-24.
    # Fandom's image for this background isn't good (generic card). Uses
    # the real art from serebii.net/pokemongo/locationcard/th/communityday2026.jpg,
    # cropped once (below the watermark "X", above the bottom black bar)
    # and committed to assets/backgrounds/ - a hotlink would always serve
    # the FULL image, without the crop. Requested by Gabriel on 2026-08-24.
    "special-background-community-2026": {
        "image": "assets/backgrounds/community-day-2026.jpg",
    },
}

# Backgrounds "Special" que na pratica so saem em evento presencial de uma
# regiao especifica (mesmo classificados como "Special" pelo Fandom, nao
# "Location") - marcados a pedido do Gabriel em 2026-08-24, pra distinguir
# de especiais realmente globais na interface.
# "Special" backgrounds that in practice only came from an in-person event
# in one specific region (even though Fandom classifies them as "Special",
# not "Location") - flagged at Gabriel's request on 2026-08-24, to tell
# them apart from truly global specials in the UI.
REGION_EXCLUSIVE_IDS = {
    "special-background-arraia-2026",
    "special-background-festival-of-colors-2026",
    "special-background-lego",
    "special-background-observatory-exhibition-tour",
}

# O Fandom lista Bulbasaur/Charmander/Squirtle SEM ci= na linha "Ultra
# Unlock: 10th Anniversary Edition" dos 3 backgrounds de time, junto com
# Raticate/Nidorino/Grimer/Gengar/Wobbuffet que TEM ci=...party (a mesma
# linha, o mesmo evento "chapeu de festa"). Confirmado pelo Gabriel: os
# 3 iniciais de Kanto tambem saem de Chapeu de Festa ali - o wiki so
# esqueceu o ci= deles. (bg_id, nome no wiki) -> ci forcado.
# Fandom lists Bulbasaur/Charmander/Squirtle with NO ci= on the "Ultra
# Unlock: 10th Anniversary Edition" row of the 3 team backgrounds,
# alongside Raticate/Nidorino/Grimer/Gengar/Wobbuffet which DO have
# ci=...party (the same row, the same "party hat" event). Confirmed by
# Gabriel: the 3 Kanto starters also come in Party Hat there - the wiki
# just forgot their ci=. (bg_id, wiki name) -> forced ci.
CI_OVERRIDES = {}
for _bg in ("special-background-valor", "special-background-mystic", "special-background-instinct"):
    for _species in ("Bulbasaur", "Charmander", "Squirtle"):
        CI_OVERRIDES[(_bg, _species)] = "%s party hat" % _species

# Confirmado pelo Gabriel: na mesma linha "Ultra Unlock: 10th Anniversary
# Edition" dos 3 backgrounds de time, os iniciais de Kanto (Agua/Fogo/
# Grama) E os de Hoenn tambem saiam SOMBROSOS - as outras geracoes de
# inicial (Johto, Sinnoh, Unova, Kalos, Alola, Galar, Paldea) nunca
# tiveram versao sombrosa no jogo. So um sinal visual (ver bg-sprite
# shadow no site); nao afeta contagem, so exibicao.
# Confirmed by Gabriel: on that same "Ultra Unlock: 10th Anniversary
# Edition" row of the 3 team backgrounds, the Kanto (Water/Fire/Grass) AND
# Hoenn starters also came as Shadow - the other starter generations
# (Johto, Sinnoh, Unova, Kalos, Alola, Galar, Paldea) have never had a
# Shadow release in the game. Display-only signal (see the site's
# bg-sprite shadow badge); doesn't affect counting.
SHADOW_ELIGIBLE_BG_IDS = {
    "special-background-valor", "special-background-mystic", "special-background-instinct",
}
SHADOW_ELIGIBLE_NUMS = {
    1, 2, 3,          # Bulbasaur, Ivysaur, Venusaur
    4, 5, 6,          # Charmander, Charmeleon, Charizard
    7, 8, 9,          # Squirtle, Wartortle, Blastoise
    252, 253, 254,    # Treecko, Grovyle, Sceptile
    255, 256, 257,    # Torchic, Combusken, Blaziken
    258, 259, 260,    # Mudkip, Marshtomp, Swampert
}


# ------------------------------------------------------------------ main
def main():
    is_test = "--test" in sys.argv

    skeleton = load_skeleton()
    entries = skeleton["entries"]
    by_species = build_species_index(entries)
    numform_idx = build_numform_index(entries)
    costume_idx = build_costume_index(entries)
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
                        ci = CI_OVERRIDES.get((bg_id, pk_name), ci.strip())
                        entries, err = match_pokemon(pk_name, ci, by_species)
                        if not entries:
                            unmatched.append((bg_id, pk_name, ci, err))
                            continue
                        for entry in entries:
                            if entry["id"] not in bg["pokemon"]:
                                bg["pokemon"][entry["id"]] = {
                                    "id": entry["id"], "num": entry["num"], "viaEvolution": False
                                }
                            costume = entry.get("costumeEn")
                            form = entry.get("regFormEn") or entry.get("altFormEn") or ""
                            if not costume:
                                targets = expand_forward(entry["num"], form, evo_idx)
                                target_pool = numform_idx
                            else:
                                # só continua a cadeia enquanto a MESMA fantasia
                                # existir na proxima etapa (ex.: Eevee "Explorer"
                                # -> as 8 eeveelutions "Explorer" - a maioria das
                                # fantasias NAO faz isso, e por isso o default
                                # continua sendo parar; ver build_costume_index).
                                targets = expand_forward_costume(
                                    entry["num"], form, costume, evo_idx, costume_idx)
                                target_pool = costume_idx.get(costume, {})
                            for (tnum, tform) in targets:
                                for te in target_pool.get((tnum, tform), []):
                                    if te["id"] not in bg["pokemon"]:
                                        bg["pokemon"][te["id"]] = {
                                            "id": te["id"], "num": te["num"], "viaEvolution": True
                                        }

    out_list = []
    untranslated = []
    for bg in backgrounds.values():
        b2 = dict(bg)
        b2["pokemon"] = sorted(bg["pokemon"].values(), key=lambda p: p["num"])
        if bg["id"] in SHADOW_ELIGIBLE_BG_IDS:
            for p in b2["pokemon"]:
                if p["num"] in SHADOW_ELIGIBLE_NUMS:
                    p["viaShadow"] = True
        b2["debut"] = earliest_debut(bg["events"], bg["year"])

        override = MANUAL_OVERRIDES.get(bg["id"], {})
        if "name" in override:
            b2["name"] = override["name"]
        if "image" in override:
            b2["image"] = override["image"]
        if "namePt" in override:
            b2["namePt"] = override["namePt"]
        elif bg["id"] in NAME_PT:
            b2["namePt"] = NAME_PT[bg["id"]]
        else:
            b2["namePt"] = b2["name"]
            untranslated.append(bg["id"])

        b2["regionExclusive"] = bg["id"] in REGION_EXCLUSIVE_IDS
        out_list.append(b2)

    # Mais novo primeiro (mesma ordem da Linha do Tempo); sem data
    # reconhecida cai por ultimo dentro do proprio ano, pelo nome.
    # Newest first (same order as the Timeline); anything without a
    # recognized date sorts last within its own year, by name.
    out_list.sort(key=lambda b: (b["debut"] or "%04d-00-00" % b["year"], b["name"]), reverse=True)

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
                  "(costumeEn preenchido) so expandem quando a MESMA fantasia "
                  "existe na proxima etapa da evolucao (ver build_costume_index) "
                  "- na maioria dos casos isso nao existe e a cadeia para ali.",
            "en": "Pokemon GO's collectible summary-page backgrounds. id = the "
                  "Fandom image filename, normalized (the stable identifier - "
                  "the displayed text sometimes repeats across different "
                  "backgrounds). pokemon[].viaEvolution=true means the entry "
                  "wasn't in the Fandom table - it was added because a listed "
                  "entry evolves into it (data/evolutions.json), respecting "
                  "form. Costumes (costumeEn set) only expand when the SAME "
                  "costume exists at the next evolution stage (see "
                  "build_costume_index) - in most cases it doesn't and the "
                  "chain stops there.",
        },
        "backgrounds": out_list,
    }

    total_pokemon = sum(len(b["pokemon"]) for b in out_list)
    n_special = sum(1 for b in out_list if b["type"] == "special")
    n_location = sum(1 for b in out_list if b["type"] == "location")
    n_no_debut = sum(1 for b in out_list if not b["debut"])
    print("Backgrounds: %d especiais/special, %d de local/location, %d vinculos pokemon/pokemon links"
          % (n_special, n_location, total_pokemon))
    if n_no_debut:
        print("AVISO: %d background(s) sem data de estreia reconhecida no texto do evento "
              "(entraram so pelo ano da secao) / background(s) with no recognized debut date "
              "in the event text (only the section year was used):"
              % n_no_debut)
        for b in out_list:
            if not b["debut"]:
                print("  %s — %s" % (b["id"], b["events"]))
    if untranslated:
        print("\nAVISO: %d background(s) sem traducao em PT em NAME_PT (usando o nome em "
              "ingles) / background(s) without a PT translation in NAME_PT (using the "
              "English name):" % len(untranslated))
        for bid in untranslated:
            print("  " + bid)

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
