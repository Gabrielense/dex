/* Ícones desenhados à mão, em SVG. Substituem os emojis, que ficavam
   ilegíveis em 14px e viravam sopa de letrinhas quando combinados
   (🌍🔥✨). Todos herdam a cor via currentColor e vivem numa caixa 24x24. */

const Icons = (() => {
  const P = {
    /* Pokébola — a dex principal */
    ball: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M3 12h6M15 12h6" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>',

    /* Brilho de 4 pontas — brilhante */
    sparkle: '<path d="M12 2.5 13.9 9 20.5 11 13.9 13 12 19.5 10.1 13 3.5 11 10.1 9Z" ' +
             'fill="currentColor"/><path d="M18.5 16.5 19.4 19l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z" ' +
             'fill="currentColor" opacity=".65"/>',

    /* Trevo de quatro folhas — sortudo */
    clover: '<path d="M12 12c0-2.5-1-4.5-3-4.5S6 9 6 11s1.5 3 3.5 3c1.3 0 2.5-.7 2.5-2Z" fill="currentColor"/>' +
            '<path d="M12 12c0-2.5 1-4.5 3-4.5s3 1.5 3 3.5-1.5 3-3.5 3c-1.3 0-2.5-.7-2.5-2Z" fill="currentColor"/>' +
            '<path d="M12 12c-2.5 0-4.5 1-4.5 3s1.5 3 3.5 3 3-1.5 3-3.5c0-1.3-.7-2.5-2-2.5Z" fill="currentColor"/>' +
            '<path d="M12 12c2.5 0 4.5 1 4.5 3s-1.5 3-3.5 3-3-1.5-3-3.5c0-1.3.7-2.5 2-2.5Z" fill="currentColor" opacity=".7"/>',

    /* Triângulo cheio, grande — XXL (o maior já registrado). A régua com
       setinhas finas sumia nos badges pequenos (11-14px); forma sólida
       aguenta qualquer tamanho. */
    xxl: '<path d="M12 2.5 21.5 20 2.5 20Z" fill="currentColor"/>',

    /* Mesmo triângulo, em escala menor — XXS (o menor já registrado). Par
       visual com o XXL: mesma forma, só o tamanho muda. */
    xxs: '<path d="M12 9 15.5 15.5 8.5 15.5Z" fill="currentColor"/>',

    /* Estrela cheia — 100% */
    star: '<path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8Z" fill="currentColor"/>',

    /* Chama — sombroso */
    flame: '<path d="M12 2.5c3.5 4 5.5 6.4 5.5 9.6a5.5 5.5 0 1 1-11 0c0-1.7.6-3 1.6-4.4.3 1 .9 1.8 1.8 2.2 ' +
           '.3-3 1.2-5.4 2.1-7.4Z" fill="currentColor"/>' +
           '<path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.6 1.3-2.5 2.8-4.7 1.5 2.2 2.8 3.1 2.8 4.7A2.8 2.8 0 0 1 12 21Z" ' +
           'fill="var(--panel,#fff)" opacity=".55"/>',

    /* Gota com brilho — purificado */
    purify: '<path d="M12 2.8c3.4 4.3 5.6 7 5.6 9.9a5.6 5.6 0 1 1-11.2 0c0-2.9 2.2-5.6 5.6-9.9Z" ' +
            'fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M12 8.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9Z" fill="currentColor"/>',

    /* Chama + brilho — sombroso brilhante */
    flameSparkle: '<path d="M10.5 2.8c3.2 3.8 5 6 5 9a5 5 0 1 1-10 0c0-1.6.6-2.8 1.5-4.1.3.9.8 1.6 1.6 2 ' +
                  '.3-2.8 1.1-5 1.9-6.9Z" fill="currentColor"/>' +
                  '<path d="M18.6 13.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor" opacity=".8"/>',

    /* Setas crescendo dentro de um círculo — dinamax */
    dmax: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="m8 13.5 4-4.5 4 4.5" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="m8 17 4-4.5 4 4.5" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>',

    dmaxSparkle: '<circle cx="10.5" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="m7 13.5 3.5-4 3.5 4" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="M19.6 14.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor"/>',

    /* Losango angular da megaevolução */
    mega: '<path d="M12 2 20 12l-8 10-8-10Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M12 7.5 16 12l-4 4.5L8 12Z" fill="currentColor"/>',

    /* Pokébola inflada com raios — gigamax */
    gmax: '<circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M5 13h4.2M14.8 13H19" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="12" cy="13" r="2.4" fill="currentColor"/>' +
          '<path d="M12 3.4v2M6.5 5.2l1.3 1.6M17.5 5.2l-1.3 1.6" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round"/>',

    gmaxSparkle: '<circle cx="10.5" cy="13" r="6.4" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M4.1 13h3.8M13.1 13h3.8" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="10.5" cy="13" r="2.2" fill="currentColor"/>' +
          '<path d="M19.6 4.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor"/>',

    /* Globo — variante regional */
    globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
           '<path d="M3.2 9.5h17.6M3.2 14.5h17.6" stroke="currentColor" stroke-width="1.7"/>' +
           '<path d="M12 3c2.6 2.4 3.9 5.4 3.9 9s-1.3 6.6-3.9 9c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3Z" ' +
           'fill="none" stroke="currentColor" stroke-width="1.7"/>',

    globeFlame: '<circle cx="9.5" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="2"/>' +
           '<path d="M2.4 9.6h14.2M2.4 14.4h14.2" stroke="currentColor" stroke-width="1.5"/>' +
           '<path d="M18.5 12.6c1.9 2.2 3 3.5 3 5.2a3 3 0 1 1-6 0c0-1.7 1.1-3 3-5.2Z" fill="currentColor"/>',

    globeFlameSparkle: '<circle cx="8.6" cy="11.4" r="6.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
           '<path d="M2.2 9.2h12.8M2.2 13.6h12.8" stroke="currentColor" stroke-width="1.4"/>' +
           '<path d="M18 11c1.6 1.9 2.5 3 2.5 4.4a2.5 2.5 0 1 1-5 0c0-1.4.9-2.5 2.5-4.4Z" fill="currentColor"/>' +
           '<path d="M18.4 2.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" fill="currentColor" opacity=".85"/>',

    /* Globo encolhido + brilho — variante regional brilhante */
    globeSparkle: '<circle cx="9.3" cy="10.3" r="6.6" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
           '<path d="M3.3 8.1h12M3.3 12.5h12" stroke="currentColor" stroke-width="1.3"/>' +
           '<path d="M9.3 3.7c1.9 1.8 2.9 4 2.9 6.6s-1 4.8-2.9 6.6c-1.9-1.8-2.9-4-2.9-6.6s1-4.8 2.9-6.6Z" ' +
           'fill="none" stroke="currentColor" stroke-width="1.3"/>' +
           '<path d="M18.6 14.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z" fill="currentColor"/>',

    /* Peça de quebra-cabeça — forma alternativa */
    form: '<path d="M4 5.5h5a2 2 0 1 1 4 0h5v5a2 2 0 1 0 0 4v5h-5a2 2 0 1 0-4 0H4v-5a2 2 0 1 0 0-4Z" ' +
          'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',

    /* Peça encolhida + brilho — forma alternativa brilhante */
    formSparkle: '<path d="M3 6.1h3.6a1.6 1.6 0 1 1 3.2 0H13.4v3.6a1.6 1.6 0 1 0 0 3.2V16.5H9.8a1.6 1.6 0 1 0-3.2 0H3v-3.6a1.6 1.6 0 1 0 0-3.2Z" ' +
          'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
          '<path d="M18.6 15.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z" fill="currentColor"/>',

    /* Chapéu de festa — fantasia */
    hat: '<path d="M12 3 18.5 17h-13Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
         '<path d="M4.5 19.5c1.6-1.2 3.3-1.2 5 0s3.4 1.2 5 0 3.4-1.2 5 0" fill="none" ' +
         'stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
         '<circle cx="12" cy="2.6" r="1.6" fill="currentColor"/>',

    hatFlame: '<path d="M9.5 3 15 15H4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
         '<circle cx="9.5" cy="2.6" r="1.5" fill="currentColor"/>' +
         '<path d="M18.5 12.6c1.9 2.2 3 3.5 3 5.2a3 3 0 1 1-6 0c0-1.7 1.1-3 3-5.2Z" fill="currentColor"/>',

    /* --- gênero --- */
    male: '<circle cx="10" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M14.5 9.5 20.5 3.5M15.5 3.5h5v5" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    female: '<circle cx="12" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M12 15v6M9 18.5h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    genderless: '<circle cx="11" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M15.5 8.5 20 4M20 9V4h-5" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>',
    genders: '<circle cx="7.5" cy="15" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M11 11.5 15.5 7M11.5 7h4.5v4.5" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="17" cy="15.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/>' +
            '<path d="M17 19v3M15.3 20.6h3.4" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" opacity=".6"/>',

    /* --- interface --- */
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="m15.5 15.5 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M16 5.5A2.5 2.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A2.5 2.5 0 0 0 5.5 16" ' +
          'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.6" ' +
           'stroke-linecap="round" stroke-linejoin="round"/>',
    pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17Z" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linejoin="round"/><path d="m14.5 7 3 3" stroke="currentColor" stroke-width="2"/>',
    download: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" fill="none" stroke="currentColor" ' +
              'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<path d="M4.5 18.5h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    upload: '<path d="M12 20.5v-11M7.5 13.5 12 9l4.5 4.5" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M4.5 4.5h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    warn: '<path d="M12 3.5 22 20H2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M12 9.5v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '<circle cx="12" cy="17" r="1.2" fill="currentColor"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
              '<path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };

  /* Ícones do próprio jogo (assets/icons/, baixados do wiki do GO).
     São glifos BRANCOS — o jogo os usa dentro de pílulas coloridas, e é
     assim que renderizamos: distintivo redondo na cor da categoria com o
     glifo branco dentro. Categorias sem asset oficial usam o SVG desenhado
     à mão, branco, no mesmo distintivo — tudo fica uniforme.
     ovl = distintivo pequeno sobreposto (ex.: brilho para "sombroso ✦"). */
  const CAT_IMG = {
    pokemon:  { img: "pokedex" },
    shiny:    { img: "shiny" },
    lucky:    { img: "lucky" },
    perfect:  { img: "perfect" },
    shadow:   { img: "shadow" },
    purified: { img: "purified" },
    shadowShiny: { img: "shadow", ovl: "shiny" },
    dmax:     { img: "dynamax" },
    dmaxShiny:{ img: "dynamax", ovl: "shiny" },
    mega:     { img: "mega" },
    gmax:     { img: "gigantamax" },
    gmaxShiny:{ img: "gigantamax", ovl: "shiny" },
    costume:  { img: "event" },
    costumeShiny: { img: "event", ovl: "shiny" },
    costumeShadow: { img: "event", ovl: "shadow" },
    /* camadas do living dex */
    regular:  { img: "pokedex" },
    shinyL:   { img: "shiny" },
    event:    { img: "event" },
    shadowL:  { img: "shadow" },
    purifiedL:{ img: "purified" },
    dmaxL:    { img: "dynamax" },
    luckyL:   { img: "lucky" }
  };

  /* Distintivo de categoria: círculo na cor da categoria, glifo branco.
     `cat` precisa de .key, .color e .icon (fallback SVG). */
  function badge(cat, size) {
    const s = document.createElement("span");
    s.className = "catbadge";
    s.style.width = s.style.height = (size || 22) + "px";
    s.style.background = cat.color || "#888";
    const def = CAT_IMG[cat.key];
    if (def && def.img) {
      const im = document.createElement("img");
      im.src = "assets/icons/" + def.img + ".png";
      im.alt = "";
      im.loading = "lazy";
      s.appendChild(im);
      if (def.ovl) {
        const ov = document.createElement("img");
        ov.src = "assets/icons/" + def.ovl + ".png";
        ov.alt = "";
        ov.className = "ovl";
        s.appendChild(ov);
      }
    } else {
      s.appendChild(svg(cat.icon, Math.round((size || 22) * .62)));
    }
    return s;
  }

  /* -> <svg> pronto pra inserir */
  function svg(name, size) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size || 18);
    s.setAttribute("height", size || 18);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.classList.add("ico");
    s.innerHTML = P[name] || P.ball;
    return s;
  }

  function has(name) { return !!P[name]; }

  return { svg, badge, has, paths: P };
})();
