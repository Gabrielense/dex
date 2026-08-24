# Planos — pesquisado, ainda não implementado

Dois recursos pedidos pelo Gabriel, com a pesquisa de fontes feita. Nada daqui
está no código ainda, **exceto** o grafo de evolução (base dos itens 1 e 2),
que já existe: [tools/build_evolutions.py](tools/build_evolutions.py) →
`data/evolutions.json`. Roda offline sem afetar o site (ninguém importa esse
arquivo ainda) — baixa `pokemon_evolutions.json` da pogoapi e gera um grafo
por nó `{num, form}` com `evolvesTo`/`evolvesFrom` (listas, porque Eevee
diverge em 8 e os 3 mantos de Burmy convergem no mesmo Mothim). `form` é
sempre um `regFormEn`/`altFormEn` EXATO de `data/skeleton.json` (ou `""`),
então já respeita "Raticate de Alola vem de Rattata de Alola" sem precisar
de outro passo de tradução. Rodar de novo quando sair geração nova:
`python tools/build_evolutions.py`.

---

## 1. Pré-evoluções na string de busca — **Feito** (exceto fantasias)

**A ideia.** Se falta o Venusaur brilhante, um Bulbasaur brilhante resolve
(evolui e registra). Então a busca de faltantes deveria incluir os números das
pré-evoluções — hoje `3` viraria `1,2,3`.

Implementado em 2026-08-24: `Agg.numEvolvesFrom`/`Agg.preEvoNums()` em
[js/aggregate.js](js/aggregate.js) leem `data/evolutions.json` (carregado em
[js/app.js](js/app.js) junto com skeleton/categories) e achatam o grafo por
NÚMERO com fechamento transitivo. `searchString(catKey, region, includePreEvo)`
soma os ancestrais de cada faltante num `Set` (sem repetir número). O toggle
"Incluir pré-evoluções" fica em [js/views.js](js/views.js) (tela Faltantes),
desligado por padrão. Fantasias são puladas item a item
(`!it.display.costumePt`) porque evoluir a espécie lisa não garante a
fantasia — a busca some sem a fantasia (só os itens **da fantasia** ficam de
fora; nada muda pras outras categorias). A nota de tamanho não garantido
aparece só nas categorias XXL/XXS.

**Fonte de dados — encontrada e é boa.** A [pogoapi.net](https://pogoapi.net)
publica `GET /api/v1/pokemon_evolutions.json`:

- JSON estático, gratuito, derivado do Game Master do próprio GO (então só tem
  evoluções que EXISTEM no GO — melhor que a PokéAPI pra este caso);
- cada registro: `pokemon_id`, `pokemon_name`, `form` e um array `evolutions`
  com o alvo (`pokemon_id`, `pokemon_name`), candy, item, etc.;
- tem `api_hashes.json` pra saber quando o arquivo mudou (cache local).

Alternativas, se um dia precisar: o Game Master bruto do PokeMiners
(github.com/PokeMiners/game_masters, campo `evolutionBranch`) e a PokéAPI
(`/evolution-chain`, mas inclui evoluções que não existem no GO).

**Plano de implementação (quando for a hora):**

1. ~~`tools/build_evolutions.py`: baixa o JSON da pogoapi...~~ **Feito** — ver
   nota no topo do arquivo. O que falta é só o passo de consumo: inverter
   `data/evolutions.json` (alvo → lista de pré-evoluções, transitivo:
   Venusaur → [Ivysaur, Bulbasaur], por NÚMERO — a busca do jogo agrupa por
   número, forma não muda o número) num `data/preevo.json` pequeno
   (`{ "3": [1, 2], ... }`), ou gerar isso em memória no próprio site a
   partir do `evolutions.json` já publicado (~97 KB, cabe tranquilo).
2. Em `searchString()`: expandir cada número faltante com suas pré-evoluções,
   dedup, ordenar. Um toggle na tela ("incluir pré-evoluções") pra não inflar a
   string de quem não quer.
3. Cuidados (corrigidos pelo Gabriel):
   - **Formas**: pré-evolução tem que respeitar a forma (Alolan Raticate ←
     Alolan Rattata, não Rattata de Kanto). O JSON da pogoapi tem `form`;
     mapear para os sufixos de variação regional da planilha.
   - **Vale em quase tudo**: brilhante, sombroso, purificado e sortudo herdam
     o status ao evoluir, e **XXL/XXS também herdam o tamanho na maioria dos
     casos** — então a expansão fica LIGADA para tamanho também (com nota na
     interface de que a herança de tamanho não é 100% garantida).
   - **Fantasias evoluem ÀS VEZES** — é caso a caso, e é o pedaço difícil.
     Ver o plano próprio abaixo.

### Fantasias que evoluem — como construir esse JSON

Não existe um endpoint pronto. Duas fontes, em ordem de preferência:

1. **Game Master do PokeMiners** (github.com/PokeMiners/game_masters, o
   `latest/latest.json`): os templates de Pokémon com fantasia trazem a
   evolução permitida quando ela existe (ramos `evolutionBranch` presentes nos
   templates de costume, e campos de costume-evolution adicionados pela
   Niantic quando liberaram, ex.: os iniciais de Community Day com chapéu).
   É a fonte "verdade do jogo", mas o arquivo é gigante (~40 MB) e o formato
   muda sem aviso — o script precisa ser defensivo e rodar offline no
   `update.bat`, nunca no site.
2. **Fandom como verificação**: as páginas de evento/fantasia costumam anotar
   "can evolve" por fantasia. Mesma técnica que já validamos para os
   Backgrounds: `pokemongo.fandom.com/api.php?action=parse&page=...&prop=wikitext`
   contorna o bloqueio de scraping. Serve pra conferir o resultado do Game
   Master, não como fonte primária (é wiki, atrasa).

Saída: `data/costume_evolutions.json` mapeando ID de fantasia → ID evoluído
(ex.: `0001-00-00-01` → `0002-...` quando o Ivysaur de Halloween existir).
Com isso, a expansão de pré-evoluções passa a valer também dentro da
categoria Fantasia, caso a caso.

---

## 2. Dex de Backgrounds (planos de fundo) — **Feito**

Implementado em 2026-08-24. Marca própria por PAR (background, Pokémon) —
`Store.backgroundMarks`, `{ bgId: { pokemonId: 1 } }` — exatamente como o
plano original pedia. Não dá pra derivar da marca `caught`: o mesmo
Pokémon (mesmo ID do esqueleto) pode ter sido capturado várias vezes com
backgrounds diferentes (ou nenhum), então "registrado" e "peguei com ESTE
background" são perguntas independentes. Vive no navegador, no backup
`.json` (junto de `customTiers`/`customMarks`, mesmo padrão) e numa aba
própria "Backgrounds" no `.xlsx` — nunca como coluna na aba PokéAgenda
principal, que já tem 51 colunas.

- [tools/build_backgrounds.py](tools/build_backgrounds.py) baixa o
  wikitext de `pokemongo.fandom.com/wiki/Backgrounds` (endpoint MediaWiki,
  contorna o bloqueio de scraping), faz o parse manual das tabelas wiki
  (`rowspan` incluso — vários backgrounds reaparecem em eventos diferentes
  ao longo dos anos na MESMA célula) e casa cada `{{I|Nome||ci=Forma}}` com
  uma entrada de `data/skeleton.json` por espécie + costume/forma, com
  fallback difuso quando o texto do wiki não bate exatamente com
  costumeEn/regFormEn/altFormEn. Cada background é identificado pelo NOME
  DO ARQUIVO da imagem (não pelo texto exibido — o mesmo texto se repete
  entre backgrounds diferentes). Testado contra os dados reais: 44
  especiais + 106 presenciais, 1156 vínculos Pokémon↔background, só 6
  fantasias futuras (ainda não lançadas, fora do esqueleto) ficam de fora
  — reportadas no log, resolvem sozinhas quando o esqueleto for atualizado.
- Expansão por evolução: para entradas SEM fantasia, segue
  `data/evolutions.json` PARA FRENTE (mesma regra do item 1), respeitando
  a forma do nó. Mega e Gigamax ficam de fora da expansão — não são
  resultado de evolução por doce, são um estado à parte (Energia
  Mega/partículas Max) que qualquer exemplar do número alcança, com ou sem
  background.
- Saída: `data/backgrounds.json` (`{id, type, name, image, year, events[],
  pokemon: [{id, num, viaEvolution}]}`). `id` é o nome do arquivo
  normalizado (estável entre gerações). `image` é um link
  `Special:FilePath` do Fandom (redireciona pro arquivo atual, sem
  precisar baixar/hospedar nada).
- Aba nova em [js/views.js](js/views.js) (`Backgrounds`) + agregação em
  [js/aggregate.js](js/aggregate.js) (`initBackgrounds`/`backgroundStats`/
  `backgroundItems`, lendo `Store.hasBackgroundMark`). Resumo no topo
  (especiais e presenciais, backgrounds e Pokémon), sub-abas Especiais
  (padrão)/Presenciais, card por background com banner, progresso `x/y` e
  grade de sprites clicáveis — cada sprite liga/desliga a marca daquele
  par (background, Pokémon) na hora, sem re-renderizar a tela inteira
  (mesmo espírito do botão ✓ rápido nas outras telas). Card inteiro em
  preto e branco (`filter: grayscale(1)`) enquanto nenhum par estiver
  marcado. `data/backgrounds.json` é opcional no boot — se faltar ou vier
  quebrado, o resto do site continua funcionando normalmente.
- Exportação/importação em [js/xlsxio.js](js/xlsxio.js): terceira aba do
  `.xlsx` ("Fundos", uma linha por par background×Pokémon elegível,
  coluna "Marcado"), lida de volta por `backgroundRowsToMarks` — planilhas
  antigas sem essa aba (`SHEET_NOT_FOUND`) simplesmente não mexem nas
  marcas já salvas, em vez de confundir com a aba principal. O backup
  `.json` carrega `backgroundMarks` do mesmo jeito que já carrega
  `customTiers`/`customMarks`.
- `update.bat` ganhou um passo `tools\build_backgrounds.py` (não
  bloqueante — se o Fandom estiver fora do ar, publica com o
  `backgrounds.json` que já existia em vez de travar a atualização

**Refinamentos de 2026-08-24 (segunda rodada, pedidos pelo Gabriel):**

- Ordenação por data real de lançamento, não só ano: `parse_event_date`
  em `tools/build_backgrounds.py` lê a primeira data reconhecida no texto
  de cada evento (mês+dia, ano explícito quando presente, senão o ano da
  seção `===YYYY===` de origem) e grava `debut` (ISO) em cada background —
  campo usado tanto pra ordenar (`Agg.backgroundItems`, mais novo primeiro)
  quanto pra alimentar o calendário da Linha do Tempo (abaixo).
- Tradução em PT: `nav.backgrounds`/`bg.*` viraram "Fundos" em vez de
  "Backgrounds" em todo o PT. Cada um dos 150 backgrounds catalogados
  ganhou um `namePt` curado à mão (`NAME_PT` em `tools/build_backgrounds.py`
  — nome de time/versão/temporada não tem tradução automática confiável).
  `bgNameOf(bg)` em `js/views.js` escolhe `name`/`namePt` conforme `LANG`,
  igual `nameOf`/`speciesOf`. A aba "Backgrounds" do `.xlsx` também virou
  "Fundos" (cabeçalhos "ID do Fundo"/"Nome do Fundo") — a planilha inteira
  já era só em português, então ficou consistente.
- `regionExclusive`: 4 backgrounds "Special" que na prática só saíram
  presencialmente numa região (Arraiá, Festival of Colors 2026, LEGO,
  Pokémon Astronomical Observatory) ganharam a flag `regionExclusive` em
  `REGION_EXCLUSIVE_IDS` — mostram uma tag "Regional" no card, mesma lógica
  do aviso de presenciais mas sem sair da aba Especiais (é assim que o
  Fandom classifica).
- `MANUAL_OVERRIDES`: o fundo do Mewtwo durante o GO Fest 2026: Global
  tinha nome cru (a legenda da própria imagem no Fandom, não um nome de
  verdade) e a arte hospedada lá ainda não era a final — renomeado pra
  "GO Fest Global DNA" nos dois idiomas e a imagem trocada pela oficial de
  leekduck.com/gofest/special-backgrounds. Mesmo mecanismo corrigiu o
  fundo "Road of Legends" (nome cru parecido).
- Consertos de parser encontrados no caminho: `rowspan = "N"|` com espaço
  ao redor do `=` (o Fandom não é 100% consistente) não batia com o regex
  antigo — pelo menos uma linha (Tóquio, GO Fest 2026) vazava o texto cru
  `rowspan = "4"|` pro nome do evento. E `bg_display_name` pegava só o
  primeiro pedaço antes de " · ", que podia ser um "-" solto (sobra de
  `|-` de tabela aninhada achatada em texto, ex. o mega-quadro dos 47
  fundos "Poké Lid" do Japão) — agora pula pedaços vazios/só-hífen.
- Nova sub-aba "Fundos" em Lançamentos ([js/views.js](js/views.js),
  `Agg.debutsByDateBackgrounds`): mesmo calendário ano/mês/dia de sempre,
  alimentado pelos `debut` dos backgrounds em vez das datas de estreia dos
  Pokémon. Clicar num dia abre os cards de fundo daquele dia reaproveitando
  `Backgrounds.card` — os sprites continuam clicáveis pra marcar dali
  mesmo, sem precisar trocar de aba.

**Terceira rodada (mesmo dia, ajustes finos pedidos pelo Gabriel):**

- Bug real achado ao investigar "por que só o Pikachu macho e o Raichu os
  dois gêneros": `match_pokemon()` só devolvia a linha "canônica" do
  esqueleto quando o wiki não especifica gênero (`{{I|Pikachu||70px}}`
  sem `ci=`) — para espécies com linha M/F separada (Pikachu 0025 x
  0025+F), isso perdia a fêmea na correspondência DIRETA, enquanto a
  expansão por evolução (Raichu) já incluía as duas por buscar tudo que
  bate num número+forma. Agora `match_pokemon` devolve uma LISTA de
  entradas em vez de uma só, incluindo o par inteiro quando existir. No
  mesmo lugar, achado e corrigido um vazamento parecido de Mega/Gigamax
  na correspondência DIRETA (só a expansão por evolução já excluía).
- Dois consertos de dados no `.xlsx` mestre, por cirurgia de XML (mesmo
  método de 2026-08-24 registrado na memória do projeto; backups mantidos
  como `PokéAgenda 2026 (backup 2026-08-24-pikachu-cosplay-sprites).xlsx`
  e `...-pikachu-excavator-willow-swap.xlsx`):
  - Pikachu Cosplay (Libre/Pop Star/Rock Star/Ph.D.) apontava pra IDs de
    sprite (`...-13/-27/-28/-60`) que não existem em `pogorewind/sprites/`
    — a imagem caía no fallback pro Pikachu comum. Trocado pros arquivos
    reais (`...-01/-02/-03/-04`), casados por conteúdo da imagem e
    confirmados pela própria tabela de remapeamento que o pikachugo já
    usa internamente pra esses 4 IDs.
  - Pikachu Excavador e Assistente do Professor Willow tinham as marcas
    de nome/data certas, mas apontando pro ID de sprite um do outro —
    confirmado pelo Gabriel e trocado (Excavador agora usa `...-89`,
    Assistente do Willow usa `...-93`).
  - Depois de cada conserto: `export_skeleton.py` + `check_resumo.py`
    (100% ok, sem stale novo) + `build_backgrounds.py`.
- Dex de Fundos: cards não mostram mais data, só o(s) nome(s) do evento
  (`bgEventNames`, tira o texto depois do primeiro " · "). Temporadas e
  Dias Comunitários (nome em inglês contém "Season"/"Community Day") são
  exceção — ganham um "de Mês a Mês" (`bgMonthRange`, meses extraídos do
  texto original do evento).
- Lançamentos, sub-aba Fundos: cada dia é colorido por tipo em vez de
  intensidade única — âmbar `#E0A21B` (Especial) ou azul `#3A6FB0`
  (Presencial), mesmas cores dos cards-resumo da Dex de Fundos. Dia com
  os dois tipos: o que tiver mais Pokémon elegíveis no total decide a
  cor. Sem legenda (não faria sentido pra uma escolha categórica).

**Quarta rodada (mesmo dia, mais ajustes/bugs pedidos pelo Gabriel):**

- Painel: a linha "Total" das matrizes por região virou "Registrado" (é o
  que ela sempre mostrou — pegos, não o universo). Formas especiais e
  Variantes e fantasias ganharam uma linha "Total" NOVA, hierarquia menor
  (`.total-possible-row`, cinza/menor), mostrando o universo de verdade
  por categoria — Pokédex fica de fora (o card já mostra "N não
  lançados").
- Faltantes: "Marcar tudo"/"Desmarcar tudo" (`Lists.bulkMarkChip`) —
  aplica a marca da categoria em todo mundo visível de uma vez (com
  `confirm()`), tanto na seção de faltando quanto em "Mostrar
  registrados". Ao contrário do ✓ individual, aqui um `App.rerender()`
  completo é o certo (a lista muda de composição mesmo).
  - Backgrounds tab: Eevee com fantasia (ex. "Explorer") agora expande
  pra TODAS as eeveelutions com a MESMA fantasia via evolução —
  confirmado que isso existe de verdade no jogo (`data/skeleton.json` tem
  "Explorer Vaporeon/Jolteon/.../Sylveon"). `expand_forward_costume` +
  `build_costume_index` em `tools/build_backgrounds.py`: fantasia só
  continua a cadeia enquanto a MESMA fantasia existir na próxima etapa —
  não é mais um "nunca" fixo, é checado etapa a etapa.
- Pikachu (número 25) sempre aparece na ordem do `DEX_ORDER` do
  pikachugo (não alfabética nem por ID) — copiada pra `PIKACHU_ORDER` em
  `js/aggregate.js`, aplicada via `reorderPikachu()` (reordena só o
  Pikachu dentro de uma lista maior, sem mexer na posição das outras
  espécies) em `Agg.items()`, `livingItems()`, `genderStats()`,
  `backgroundItems()`, e ordenando o grupo `byNum.get(25)` direto no
  `init()` (afeta a ficha/"outras entradas deste número").
- Consertos pontuais no `.xlsx` mestre confirmados pelo Gabriel:
  "Equipe Coragem" → "Equipe Valor" (Valor já é português, não traduz no
  jogo); West Sea Gastrodon sem data de brilhante (adicionado 2023-08-04,
  igual East Sea); Squawkabilly com data de brilhante prematura (removida
  — Gabriel confirmou que ainda não saiu).
- Sprite da Sunglasses Absol brilhante nunca aparecia brilhante: o
  arquivo existia mas com nome errado (`_S` em vez de `+S`) no repositório
  `pogorewind` — não é bug do pokeagenda, corrigido direto lá
  (`git mv` + push, conteúdo já era o brilhante certo).
- Backgrounds "Ultra Unlock: 10th Anniversary Edition" (as 3 abas de
  time): Bulbasaur/Charmander/Squirtle estavam sem `ci=` no wiki mas
  saíam de Chapéu de Festa de verdade (confirmado pelo Gabriel) —
  `CI_OVERRIDES` força a fantasia certa pra esses 3 nessas 3 linhas. Os 6
  iniciais de Kanto+Hoenn (e evoluções) também saíam Sombrosos ali —
  `SHADOW_ELIGIBLE_NUMS`/`SHADOW_ELIGIBLE_BG_IDS` marca `viaShadow:true`
  nesses pares (background, Pokémon) especificamente, mostrado como o
  mesmo selo de canto sombroso do Faltantes (`.bg-sprite-badge`).
- Imagem do fundo "2026 Community Days" trocada pela arte real de
  serebii.net (a do Fandom era genérica), recortada uma vez (abaixo da
  marca d'água "X", acima da barra preta) e commitada em
  `assets/backgrounds/community-day-2026.jpg` — hotlink sempre serviria a
  imagem inteira sem o recorte.

<details>
<summary>Plano original (histórico, antes da implementação)</summary>



**Fonte lida:** `pokemongo.fandom.com/wiki/Backgrounds` (via API MediaWiki do
Fandom — a página bloqueia scraping comum, mas
`pokemongo.fandom.com/api.php?action=parse&page=Backgrounds&prop=wikitext`
devolve o wikitext limpo).

**O que a página documenta.** Backgrounds são imagens-souvenir na página do
Pokémon, ganhas ao capturar durante eventos específicos. Dois tipos:

- **Special Backgrounds** (eventos globais) — 44 imagens catalogadas, 2024→hoje.
  Ex.: "GO Fest 2024: Wormhole" (Ultra Beasts, julho 2024), fundos de equipe
  (Valor/Instinct/Mystic), Community Days, aniversários.
- **Location Backgrounds** (eventos presenciais) — 186 imagens, 2023→hoje.
  Ex.: "Las Vegas, US" (Kyogre/Groudon, GO Tour Hoenn fev/2023), "Jeju Island"
  (Latias/Latios), City Safaris (Eevee Explorer), World Championships.

Cada linha da tabela tem: imagem/nome do background, a lista de Pokémon que
podiam vir com ele (inclusive fantasia/forma, ex. `Pikachu red`,
`Necrozma dusk mane`), o evento e as datas. A busca do jogo aceita
`locationbackground`, `specialbackground` e `background`.

**Como encaixa no PokéAgenda — plano:**

1. **Esqueleto novo, arquivo próprio** (`data/backgrounds.json`), porque a
   relação é N-pra-N: um background tem vários Pokémon, um Pokémon pode ter
   vários backgrounds. Não entra como coluna na aba PokéAgenda.
   `tools/build_backgrounds.py` baixa o wikitext e parseia as tabelas (formato
   já verificado: `{{I|Nome||70px}}` e `ci=` para fantasia/forma) →
   `[{ id, tipo: "special"|"location", nome, evento, dataInicio, dataFim,
   pokemon: [{ num, id? }] }]`. O `ci=` mapeia para os IDs de fantasia da
   planilha na medida do possível; o que não casar fica só com o número.
2. **Marcas pessoais**: um bitmask novo indexado pelo id do background
   (`marks.backgrounds` no localStorage; na exportação, uma ABA nova
   "Backgrounds" com uma linha por background e coluna de marca — não colunas
   na aba principal, senão viram 230 colunas).
3. **Aba no site**: grade de backgrounds (a imagem dá pra hotlinkar do próprio
   Fandom ou baixar uma vez pro repositório — decidir; Fandom aceita hotlink
   mas pode mudar URL), filtro especial/location/ano, cada card mostra os
   sprites dos Pokémon elegíveis e a marca "tenho". Busca do jogo:
   `specialbackground` / `locationbackground` prontas pra copiar.
4. **Manutenção**: a página do Fandom é atualizada pela comunidade a cada
   evento; rodar o `build_backgrounds.py` no `update.bat` e avisar quando
   aparecerem backgrounds novos.
5. **Limitação honesta**: location backgrounds dependem de ter IDO ao evento —
   a maioria é impossível de completar. A aba deve separar "possíveis"
   (special/globais) de "presenciais", pra lista de faltantes não virar um mar
   de viagens não feitas.
6. **Herança por evolução** — `data/evolutions.json` já existe (ver nota no
   topo). O background acompanha o Pokémon quando ele evolui: um background
   listado no Fandom para o Bulbasaur é alcançável também como Ivysaur ou
   Venusaur evoluídos daquele espécime. Na prática: expandir a lista de
   `pokemon` de cada background seguindo `evolvesTo` PARA FRENTE (recursivo,
   já que uma cadeia pode ter 2–3 estágios e a de Eevee se abre em 8),
   marcando os expandidos como "via evolução" na interface. Atenção à forma:
   se o background listou "Rattata de Alola", a expansão deve seguir o nó
   `{num:19, form:"Alolan"}` e não o Kantonian — é exatamente pra isso que o
   grafo guarda `form` por nó em vez de só o número.

**Custo estimado**: parser + esqueleto ~1 sessão; aba + marcas + exportação
mais ~1. Sem dependências novas.

</details>

---

## 3. Entrada única para novas entradas → alimenta os 3 sites

**A ideia.** Hoje, quando sai um Pokémon/fantasia/forma novo, Gabriel edita a
planilha à mão e cada site puxa de uma fonte diferente. A ideia é um
formulário só — nome, classificação (espécie/forma/fantasia/gênero/flags tipo
Mega, Gigamax, regional) e as datas de estreia — que atualiza a planilha
`PokéAgenda 2026.xlsx` (fonte de verdade) e, a partir dela, propaga pros três
sites com regras diferentes por site, não um espelho 1:1.

**Formatos confirmados (repos clonados em 2026-08-24 ao lado de `pokeagenda/`,
em `pogorewind/` e `pikachugo/`):**

- **pogorewind** — `pogorewind/datas_debut.csv`, colunas
  `Número,ID,Nome,Name,Estreia,Brilhante,Sombroso,Sombroso Brilhante,Dinamax,Dinamax Brilhante`,
  datas `dd/mm/yyyy`. Uma linha por variante/forma (mesmo grão do `ID` da
  planilha). `ID` é o nome literal do arquivo em `pogorewind/sprites/`. Linhas
  só existem quando há uma data real de estreia (pode ser uma data futura já
  anunciada — hoje já tem entradas de 2026 no arquivo).
- **pikachugo** — sem CSV, os dados ficam direto em `pikachugo/index.html`,
  array `VARIANTS_RAW` (~linha 296): cada item é
  `[code, nomeEN, nomePT, dataEstreia, dataEstreiaBrilhante, flags]`, `flags`
  ⊂ `{M, F, P}` (só macho / só fêmea / exclusivo presencial), string vazia se
  nenhuma. Só entradas do Número 25 (Pikachu) entram aqui — sem colunas de
  sombroso/dinamax porque fantasia de Pikachu não tem essas variantes.
- **pokeagenda** — já documentado: `data/skeleton.json`, gerado por
  [export_skeleton.py](tools/export_skeleton.py) a partir da planilha.

**Regras de propagação (do que o Gabriel descreveu):**

1. **Fantasia nova de Pikachu** (ex.: "só macho", evento X) → nova linha na
   planilha com Número=25 **sempre** gera uma nova entrada em
   `VARIANTS_RAW` do pikachugo (mapeando SomenteM/SomenteF/SomenteN →
   `M`/`F`/vazio, e Exclusivo/presencial → `P`), além do fluxo normal 2–3
   abaixo. Isso vale só pro pikachugo — outros números não tocam nesse repo.
2. **Mega novo / data de estreia nova em algo que já existe** (ex.: Mega já
   cadastrado, só chegou a data de lançamento) → atualiza a linha existente
   na planilha e, pela regra 3, dispara a atualização do pogorewind (e do
   pikachugo se for Número 25).
3. **Toda vez que uma data de estreia é PREENCHIDA** (estava vazia, ganhou
   valor) → gera/atualiza a linha correspondente em
   `pogorewind/datas_debut.csv` usando o `ID` da planilha como nome do
   sprite. Antes de ter data, a entrada NÃO aparece no pogorewind (mesmo
   padrão que o arquivo já segue hoje).
4. **Geração nova cai (dex numbers/nomes novos, sem data ainda)** → a
   ferramenta deve aceitar cadastrar a entrada na planilha/skeleton só com
   Número + Nome + taxonomia, datas em branco. Isso só atualiza o pokeagenda
   (skeleton mostra "não lançado ainda", igual já faz hoje pra espécies
   futuras); pogorewind e pikachugo esperam a regra 3 disparar quando a data
   chegar.

**Plano de implementação:**

1. Formulário local (HTML simples ou script Python/CLI) com os campos:
   Número, Nome PT/EN, Espécie/Variação/Forma/Traje, Região, flags (Mega,
   Gigamax, Não trocável, Regional, DiF gênero SomenteM/F/N, Lendário etc.) e
   as seis datas de estreia — mesmos campos das colunas 1–23 e 25–51 da aba
   PokéAgenda. Datas podem ficar em branco (regra 4).
2. Ao salvar: grava/atualiza a linha na planilha `PokéAgenda 2026.xlsx`
   (XML direto, como já foi feito nos consertos de 2026-08-24 — ver
   [pokeagenda-project.md](../.claude memory) — ou via openpyxl).
3. Roda `export_skeleton.py` (atualiza `data/skeleton.json` sempre).
4. Diff a planilha antes/depois: pra cada data de estreia que passou de
   vazia pra preenchida (regra 3), escreve/atualiza a linha equivalente em
   `pogorewind/datas_debut.csv`. Pra cada linha com Número=25 nova ou
   alterada (regra 1), escreve/atualiza o item correspondente em
   `VARIANTS_RAW` dentro de `pikachugo/index.html` (edição textual do array,
   já que não há build step).
5. Um `update.bat` combinado roda os três passos e faz commit+push nos três
   repositórios — cada site continua funcionando sozinho sem depender dos
   outros dois; só a ferramenta de entrada é compartilhada.
6. **Cuidado**: os IDs de sprite (`0001-00-00-01`, `+F`, `+S`, `G`, `M`...)
   têm que ficar idênticos nos três, e os únicos sprites usados vêm de
   `pogorewind/sprites/` (os outros dois hotlinkam de lá, não duplicar
   upload de imagem).

**Custo estimado**: formulário + script de propagação com as 4 regras,
2–3 sessões (a edição textual do `VARIANTS_RAW` do pikachugo exige cuidado
pra não quebrar o array/ordem esperada pela UI).
