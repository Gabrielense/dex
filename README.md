# PokéAgenda

Painel de coleção de Pokémon GO: progresso por região e categoria, listas do que
falta (com a string pra colar na busca do jogo) e uma linha do tempo de todos os
lançamentos.

*A Pokémon GO collection dashboard: progress by region and category, missing
lists with a ready-to-paste in-game search string, and a release timeline.*

---

## Como funciona / How it works

Os dados são separados em duas camadas — é isso que deixa o site público sem
expor a coleção de ninguém.

| Camada | O que é | Onde vive |
|---|---|---|
| **Esqueleto** | O que existe no jogo: entradas, nomes, regiões, marcadores e datas de estreia | `data/skeleton.json`, versionado no repositório |
| **Progresso** | Suas marcas (registrado, brilhante, sortudo, XXL…) | **Só no seu navegador.** Nunca sai da sua máquina |

Qualquer pessoa abre o site e importa a própria planilha — ou, sem planilha
nenhuma, clica em **"Começar do zero"** (na aba Meus dados) e ganha um dataset
vazio pra marcar tudo pelo site e exportar depois. Quem prefere começar pelo
Excel baixa a **planilha em branco** (esqueleto completo, zero marcas) no
mesmo lugar. A planilha é lida
**no navegador** (nada é enviado para servidor nenhum) e as marcas ficam no
`localStorage`.

Toda planilha gerada pelo site (em branco ou com marcas) sai em duas abas:
**Instruções** (o que preencher e onde, com a mesma legenda de cores abaixo)
e **PokéAgenda**. O cabeçalho de cada coluna marcável usa a cor da categoria
dela (a mesma do site e da aba Resumo original); colunas geradas pelo site
(nome, região, datas de estreia, marcadores…) ficam com cabeçalho neutro
escuro — sinal de "não precisa editar". Nas colunas `M`/`N`/`F`, a célula do
gênero impossível pra aquela espécie (Magnemite não é ♂/♀, Bulbasaur nunca é
⚲…) fica cinza, o mesmo trancamento da ficha do site traduzido pra planilha.

**As suas marcas são editáveis no site; o esqueleto não.** Dá pra marcar de dois
jeitos: o botão ✓ no canto do card marca direto a categoria que você está vendo,
e clicar no card abre a ficha com as 15 marcas (registrado, ♂/♀/⚲, brilhante,
sombroso, purificado, XXL, XXS, sortudo, 100%, dinamax…). Salva na hora, e o
painel se refaz. Marcas de coisas que ainda não estrearam ficam travadas.
Datas de estreia, nomes, regiões e marcadores só mudam na planilha.

### Régua rápida na ordem do jogo

No topo do painel, as 10 sub-dexes na MESMA ordem das abas do Pokédex do GO
(POKÉMON, BRILHANTE, SORTUDO, XXL, XXS, G-MAX, MEGA, SOMBROSO, PURIFICADO,
★ 100%), cada uma com o número de pegos — o mesmo "Pegos: N" que o jogo
mostra. É a linha de conferência ao atualizar olhando o celular.

Os denominadores dos cards usam o universo que o JOGO lista (1025 hoje), não
o total da planilha (1028) — gerações que ainda nem entraram no Pokédex de lá
ficam fora da conta, porque não são registráveis. A regra: uma região só
conta depois que algum Pokémon dela estreia.

### Pokédex Viva (Living Dex)

Não existe termo oficial em português; a comunidade usa o empréstimo "living
dex" e, quando traduz, "Pokédex Viva" (o termo canônico em inglês é "Living
Pokédex", na Bulbapedia). O site usa "Dex Viva" na navegação e "Pokédex Viva"
no título, mantendo "living dex" no texto pra quem conhece pelo nome inglês.

Aba própria para "tenho NA CAIXA agora", separado de "já registrei" — dá pra ter
o registro e ainda faltar pro living dex. Nove camadas opcionais, na ordem:
**Padrão** (um por número, sempre ligada, 1028 slots), Formas e variantes,
Macho e fêmea, Brilhante, Fantasias, Sombroso, Purificado, Dinamax, Sortudo.
Cada camada ligada vira um cartão de progresso + uma lista de faltantes com a
busca por números e o ✓ de marcação rápida. Quem está registrado mas falta na
caixa ganha a etiqueta "registrado, falta na caixa".

**Dexes personalizadas**: além das nove camadas fixas, dá pra criar
combinações livres — Brilhante + Sortudo + ♀ = "todas as fêmeas sortudas
brilhantes". Um slot por número da dex, e só entram números onde a combinação
é POSSÍVEL: estreias conferidas (brilhante/sombrosa/dinamax), trocabilidade
para sortudo, e o gênero da espécie (Magnemite nunca entra numa dex de
fêmeas). Elas vivem no navegador e no backup .json — a planilha não ganha
colunas dinâmicas de propósito, senão o formato dela viraria loteria.

A ficha também respeita o gênero: ♂/♀/⚲ impossíveis para a espécie ficam
travados (Bulbasaur nunca é ⚲, Magnemite nunca é ♂/♀) — a menos que a marca
já exista nos seus dados, caso em que ela nunca é trancada.

As marcas viajam na exportação como seis colunas novas DEPOIS do ID:
`Living dex`, `Living dex brilhante`, `Living dex sombroso`,
`Living dex purificado`, `Living dex dinamax`, `Living dex sortudo`.
Se você criar colunas com esses cabeçalhos na sua planilha-mestre, a importação
lê as marcas de lá também. Com a camada "Macho e fêmea" ligada, cada ♂ e ♀ de
formas/fantasias vira um slot próprio; desligada, o par conta como um slot só.

### Strings de busca

As buscas agora são **números da dex** (`843,844`), não nomes — mais curto e
funciona em qualquer idioma do jogo. XXL e XXS ganham o filtro de tamanho na
frente: `XXL&30,86,111,…` (na busca do GO, vírgula = OU, & = E).
Pré-evoluções na busca estão planejadas — veja `PLANS.md`.

### Painel de gênero

Três cartões no mesmo formato das outras seções (ícone, número, barra,
"faltam"/"completo") — sem texto de pergunta, só o dado:

1. **Gêneros na dex** — nos Pokémon que têm macho e fêmea, quantos têm os dois
   registrados (hoje 761/781).
2. **Diferença visual** — nas espécies em que macho e fêmea são diferentes,
   quantas têm o par completo. Uma nota abaixo do cartão separa "tenho um e
   falta o outro" (a lacuna de gênero de verdade) de "não tenho nenhum dos
   dois", que é fantasia faltando, não gênero.
3. **Só de um gênero** — quantos têm só ♂ ou só ♀, com a lista completa (sprite
   + etiqueta do que falta) num clique.

O casamento dos pares é feito pelo **ID** sem o `+F`, de propósito: o `Número` veio
errado em algumas linhas e não dá pra confiar nele.

> ⚠️ Armazenamento de navegador pode ser apagado (limpar dados, modo anônimo,
> trocar de máquina). **O arquivo exportado é a cópia definitiva.** O site avisa
> quando você editou marcas e ainda não exportou.

---

## Atualizando o esqueleto (só o dono do repositório)

Novas datas de estreia, novas fantasias, geração nova — tudo é o mesmo fluxo:

1. Edite a `PokéAgenda 2026.xlsx` no Excel como sempre e salve.
2. Rode `update.bat` (duplo clique).
3. Pronto — a Vercel publica sozinha.

O `update.bat` faz três coisas: gera o `skeleton.json`, **confere as contas
contra a aba Resumo** e só então dá commit e push. Se alguma conta não bater,
ele para e mostra a divergência em vez de publicar dado errado.

Manualmente, se preferir:

```bash
python tools/export_skeleton.py "../PokéAgenda 2026.xlsx"
python tools/check_resumo.py "../PokéAgenda 2026.xlsx"
```

### Adicionando colunas ou categorias

As regras de contagem ficam todas em **`data/categories.json`** — um arquivo só,
lido tanto pelo site quanto pelo verificador em Python. Mexeu ali, os dois
seguem juntos; não existe lógica duplicada pra sair de sincronia.

Cada categoria declara: o escopo (`dex` ou `entry`), qual data de estreia libera
o item (`gate`), qual subconjunto de entradas ela cobre (`subset`), qual marca
conta (`mark`) e as colunas da Resumo usadas só pra conferência.

---

## Uma diferença proposital em relação à planilha

Na planilha, as contagens de Pokédex filtram a coluna `Dex = "Sim"`: uma linha
"canônica" por número, porque o Excel precisava de uma linha só pra contar. Isso
erra nos casos em que a linha canônica não representa o que você tem — um
Pikachu de fantasia não conta pro Pikachu, uma letra de Unown não conta pro
Unown.

Aqui a regra é a do jogo: **agrupa por número e qualquer entrada daquele número
conta**. A coluna `Dex` continua sendo importada, mas não entra em conta nenhuma.

O `check_resumo.py` mostra os dois lados: o modo `legacy` (que reproduz a
planilha célula por célula, provando que a leitura está certa) e o modo
`anyEntry` (a regra correta), com a diferença entre eles.

### Conferido contra o jogo

Os números do site batem com os prints do Pokédex de verdade (`pokedex_screenshots/`):
Pokémon 952, Brilhante 848, Sortudo 934, XXL 786, XXS 766, 100% 383, Sombroso 457,
Purificado 456, G-MAX 17, Mega 58 — e os 11 denominadores por região também
(Kanto 151/151, Sinnoh 104/107, Alola 80/86, Galar 72/89, Hisui 6/7, Paldea 74/120…).

O card mostra **pego / lançado**, que é o acionável — diferente do **pego / total**
que o jogo mostra em algumas abas (contando o que ainda nem saiu). Só nas
categorias presas à estreia normal: para Brilhante, Sombroso, Dinamax etc.
ninguém sabe quantos ainda virão, e o próprio jogo não mostra denominador
nessas abas.

### Falhas da planilha que o site corrige

- As linhas **Hisui** e **Paldea** da Resumo não têm as fórmulas de Fantasia
  (colunas AW–AZ vazias), então 4 entradas com traje nunca eram contadas.
- **Primal Kyogre e Primal Groudon** entram em Mega (como no jogo). Na planilha
  isso é uma fórmula especial só na linha de Hoenn.

Tudo isso está declarado em `data/categories.json` (`_knownSheetGaps`), então o
verificador lista essas diferenças como "corrigido" em vez de "erro".

### Consertos aplicados na planilha (24/08/2026)

Aplicados por cirurgia de XML — só o worksheet da aba 1 mudou; o Resumo, a
formatação condicional e as outras abas ficaram byte a byte iguais. Backup em
`PokéAgenda 2026 (backup 2026-08-24).xlsx`.

1. **Zygarde Forma 10%** ganhou `Não trocável = Sim` (o denominador de Sortudo
   voltou de 937 para 936 — Sortudo completo, igual ao jogo).
2. **8 linhas com `Número` errado** (autofill: 26–32 em vez de 25 nas fantasias
   de Pikachu, linhas 242 e 245–251) corrigidas — e o mesmo arrasto tinha posto
   os números 90–93 na coluna Sombroso de 4 delas; limpos também. O
   `export_skeleton.py` segue comparando Número com o prefixo do ID a cada
   export.
3. **Marshadow** nunca saiu brilhante: a marca `Brilhante` errada foi removida.
   Com isso, `Brilhante` e `Dex brilhante` ficaram 100% consistentes entre si
   (qualquer-entrada por número).
4. **Mega Gallade** ganhou `Estreia brilhante = 11/01/2025` e **Genesect Disco
   Congelante** `= 03/12/2024`.
5. **Zigzagoon e Linoone**: o sombroso lançado é o da forma de Galar, mas a
   canonicidade antiga tinha forçado a marca na forma normal (as células de
   Galar diziam literalmente "Bug"). Datas `Estreia sombroso`/`sombroso
   brilhante` movidas para as linhas de Galar, marcas `x` postas lá, forma
   normal limpa. Os totais por número não mudam; Variante sombrosa passa de
   18 para 20.
6. As **fantasias de Pikachu** com marcas sombrosas sem data são intencionais:
   o aviso de saúde as ignora (`_orphanIgnore` em `data/categories.json`).
   Marcas órfãs restantes: **zero**.

O workbook ganhou `fullCalcOnLoad`: na próxima vez que abrir no Excel, o Resumo
recalcula sozinho — salve para gravar. Até lá o `check_resumo.py` lista as 8
células envelhecidas como "aguardando recálculo" (seção `_staleUntilRecalc` do
`categories.json`, apagável depois) sem travar o `update.bat`.

### O que "faltando" quer dizer

As listas separam dois baldes, porque são tarefas diferentes:

- **Faltando** — você tem o Pokémon, falta esta marca. É o que dá pra caçar, e é
  só isso que entra na string de BUSCA.
- **Depende do registro base** — você nem registrou o Pokémon ainda; primeiro
  resolva a dex.

É por isso que a planilha diz "Completo!" no Sortudo: os únicos sem sortudo eram
Silicobra e Sandaconda, que você não tem de jeito nenhum. Agora o site diz a mesma
coisa, mas sem esconder os dois.

### Datas e o cache do Excel

A aba Resumo guarda o que o Excel calculou da última vez que o arquivo foi aberto,
com o `TODAY()` daquele dia. Se algo estreia depois disso, a conferência acusaria
uma diferença que não existe. O `check_resumo.py` detecta isso sozinho: volta no
calendário até achar a data em que a planilha foi recalculada e avisa qual foi.

---

## Estrutura

## Visual

Casca de Pokédex — vermelho, a lente azul e os três LEDs no topo, abas encaixadas
na borda. A área de dados é tratada como a "tela" do aparelho e fica limpa, pra
não atrapalhar a leitura dos números.

**Tema padrão**: no desktop (mouse com hover) abre no claro, de propósito —
é onde a leitura de tabela é mais comum. No celular (sem hover) segue o tema
do aparelho, como sempre foi. Isso só vale até a primeira escolha manual no
botão ◐: a partir daí o tema escolhido (inclusive "seguir o sistema", o
terceiro clique) vale em qualquer dispositivo.

No tema escuro as superfícies são **carvão neutro levemente quente**, não
azul-ardósia: misturar painéis frios com a casca vermelha (quente e saturada)
criava briga de temperatura de cor. Regra 60-30-10 — o fundo dominante fica
neutro e deixa o vermelho ser a identidade; o azul sobrevive só na lente, onde
é parte do aparelho. Links no escuro usam um rosa-salmão puxado do vermelho.

Cada categoria tem a cor da sua aba no Pokédex do jogo (as mesmas que você usou
nos fundos da tabela do Resumo): Pokémon azul, Brilhante dourado, Sortudo laranja,
XXL azul-aço, XXS violeta, 100% vermelho, Sombroso roxo, Purificado turquesa,
Mega e Gigamax rosa/magenta.

Os ícones de categoria são os **glifos do próprio jogo** (`assets/icons/`,
baixados do wiki do GO — Ic_shiny, Ic_shadow, Mp-Icon_Mega, Ic_appraisal_04
etc.), renderizados como o jogo renderiza: glifo branco dentro de uma pílula
redonda na cor da categoria. Combinações (sombroso ✦) ganham um distintivo
pequeno sobreposto. Categorias sem asset oficial (XXL/XXS, variantes, formas,
gênero) usam SVGs desenhados à mão no mesmo distintivo, então tudo fica
uniforme. A matriz por região continua em **três tabelas menores com nomes
escritos** em vez de uma de 20 colunas de símbolos.

**Sprites pequenos**: alguns PNGs têm o Pokémon minúsculo num canvas cheio de
margem transparente. O site mede a caixa real do desenho (um canvas 40×40
compartilhado, ~6 KB por análise) e compensa com `transform:scale`, com o
resultado num cache em `localStorage` — cada sprite é analisado uma vez na
vida. **Memória**: as grades grandes são paginadas (240 por vez, botão
"mostrar mais"), os cards usam `content-visibility:auto` (fora da tela o
navegador não mantém nem pintura nem bitmap) e marcar pelo ✓ não reconstrói
mais a tela inteira. Heap de JS medido: ~3 MB, estável após dezenas de
navegações.

## Estrutura

```
index.html            página única
css/style.css         tema claro/escuro
js/
  i18n.js             textos PT/EN
  icons.js            ícones SVG
  store.js            marcas pessoais no localStorage
  aggregate.js        motor de contagem (espelha o check_resumo.py)
  zip.js              zip/unzip nativo, sem biblioteca
  xlsxio.js           ler e escrever .xlsx / .csv / .json
  sprites.js          sprites + cadeia de fallback
  views.js            painel, faltantes, linha do tempo, gênero, ficha
  dataview.js         importar / exportar / saúde dos dados
  app.js              controlador
data/
  skeleton.json       gerado — não edite à mão
  categories.json     regras de contagem (edite aqui)
tools/
  export_skeleton.py  planilha -> skeleton.json
  check_resumo.py     confere as contas contra a aba Resumo
update.bat            gerar + conferir + publicar
```

Sem build, sem dependência em runtime. O `.xlsx` é lido e escrito com
`DecompressionStream`/`CompressionStream` do próprio navegador.

**Sprites** vêm por URL do repositório `pogorewind`, que já tem os ~3.500
arquivos. Nada é duplicado aqui.

---

## Rodando local

```bash
python -m http.server 8777
```

Depois abra `http://localhost:8777`. (Abrir o `index.html` direto pelo disco não
funciona: o `fetch` dos dados é bloqueado em `file://`.)

## Compatibilidade

Precisa de um navegador com `DecompressionStream` (Chrome 80+, Firefox 113+,
Safari 16.4+) para ler `.xlsx`. Em navegadores mais antigos, o import por `.csv`
e por backup `.json` continua funcionando.

---

Feito por [Gabrielense](https://github.com/Gabrielense).
