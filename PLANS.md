# Planos — pesquisado, ainda não implementado

Dois recursos pedidos pelo Gabriel, com a pesquisa de fontes feita. Nada daqui
está no código ainda.

---

## 1. Pré-evoluções na string de busca

**A ideia.** Se falta o Venusaur brilhante, um Bulbasaur brilhante resolve
(evolui e registra). Então a busca de faltantes deveria incluir os números das
pré-evoluções — hoje `3` viraria `1,2,3`.

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

1. `tools/build_evolutions.py`: baixa o JSON da pogoapi, inverte a direção
   (alvo → lista de pré-evoluções, transitivo: Venusaur → [Ivysaur, Bulbasaur])
   e grava `data/preevo.json` como `{ "3": [1, 2], "6": [4, 5], ... }`
   (uns 2–3 KB). Rodar dentro do `update.bat` — sem chamada de rede no site.
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

## 2. Dex de Backgrounds (planos de fundo)

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
6. **Herança por evolução** (depois que o JSON de evoluções estiver pronto):
   o background acompanha o Pokémon quando ele evolui. Então um background
   listado no Fandom para o Bulbasaur é alcançável também como Ivysaur ou
   Venusaur evoluídos daquele espécime. Na prática: expandir a lista de
   `pokemon` de cada background com a cadeia evolutiva (para FRENTE, usando o
   mesmo `data/preevo.json` invertido), marcando os expandidos como
   "via evolução" na interface. Depende do item 1 deste arquivo — fazer na
   ordem: evoluções → busca com pré-evos → backgrounds com herança.

**Custo estimado**: parser + esqueleto ~1 sessão; aba + marcas + exportação
mais ~1. Sem dependências novas.
