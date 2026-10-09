# Stargazer — Système de design

Établi le 8 octobre 2026. Chaque règle vient d'une mesure sur le code réel ou
d'une contrainte d'usage sur le terrain, pas d'une préférence esthétique.

## Le contexte dicte tout

L'application se pilote **dehors, de nuit, à bout de bras**, par quelqu'un dont
les yeux sont adaptés à l'obscurité et les doigts froids. Toute décision qui
ignore ce contexte est fausse, même si elle est belle sur un écran de bureau.

## Vision nocturne — la contrainte au-dessus des autres

L'adaptation à l'obscurité demande 20 à 30 minutes et se détruit en une seconde.
Les bâtonnets, seuls actifs en vision scotopique, culminent à **~507 nm** — en
plein dans le cyan `#00FFD1` qui était l'accent de l'application. Seules les
longueurs d'onde au-delà de **~620 nm** la laissent intacte.

C'est pourquoi la recommandation générique d'un CTA vert `#22C55E` a été
**écartée** : pour cet outil, vert et cyan sont les pires choix possibles.

Mise en œuvre : `:root[data-vision="night"]` pose une surcouche fixe en
`mix-blend-mode: multiply` rouge, doublée d'un `backdrop-filter: grayscale(1)`.

Pourquoi une surcouche et non un `filter` sur `<body>` : le filtre **annule les
`backdrop-filter` des descendants**, or toute l'identité visuelle repose sur des
panneaux de verre flous. La surcouche n'intervient qu'à la composition finale.

Pourquoi une couche globale et non un simple remappage de tokens : mesure faite,
**332 couleurs passent par `var(--…)` contre 1617 écrites en dur** (580 hex,
1037 rgba). Un remappage ne recolorerait que 17 % de l'interface.

Trois paliers d'assombrissement (`data-dim`) : un écran rouge trop lumineux
éblouit tout autant qu'un écran blanc.

## Typographie — l'échelle est pilotée, pas figée

L'audit a relevé **255 tailles arbitraires sous 12px** dans les classes, dont une
à 6px, plus **79 `fontSize` inline** et **103 `text-xs`** qui contournaient toute
échelle. Le tout fréquemment sous `opacity-60`.

Toutes dérivent désormais de `--hud-scale`, piloté par `data-density` :

| Densité | Multiplicateur | `text-hud-2xs` |
|---|---|---|
| compact | 0,875 | 10,5 px |
| normal | 1 | 12 px |
| extérieur | 1,25 | 15 px |

Le choix d'un multiplicateur plutôt que d'une taille unique est délibéré :
l'interface est dense par nature, et c'est à l'observateur d'arbitrer selon ses
conditions. **Ne jamais réintroduire de taille en dur**, ni en classe
(`text-[10px]`) ni en style inline (`fontSize: "10px"`).

Le libellé se distingue de la valeur par la graisse et l'interlettrage, jamais
par une opacité qui détruit le contraste.

## États matériels — jamais la couleur seule

Le 5 août 2026, le tube a parcouru 260° parce que la position affichée était
figée sans que rien ne le signale. Un état « liaison perdue » doit se distinguer
d'un état « au repos » au premier coup d'œil, de loin.

La couleur ne porte jamais l'information seule : le mode nuit rend l'interface
monochrome et écrase toutes les teintes. Chaque état a donc une **forme** et un
**mot** en plus de sa couleur.

| État | Forme | Mot |
|---|---|---|
| au repos | rond | Au repos |
| en mouvement | rond pulsé | En mouvement |
| en butée | **carré** | En butée |
| liaison perdue | rond éteint | Liaison perdue |

Composant : `src/components/ui/HardwareState.tsx`.

## Interaction

- **44 px minimum** de cible tactile (`--size-touch`), 56 px pour les commandes
  qu'on vise à l'aveugle. Mesuré doigts froids, pas souris.
- **Jamais de `hover:scale`** sur une cible : l'agrandissement déplace la cible
  sous le doigt au moment de l'appui. Changement de fond uniquement.
- Tout élément cliquable porte `cursor-pointer` et un état de survol visible.
- Transitions de 150 à 300 ms, sur `transform` et `opacity` uniquement.

## Accessibilité

L'audit n'a trouvé **aucun état de focus** dans les 57 fichiers d'interface :
l'application était inutilisable au clavier. Une règle globale `:focus-visible`
les couvre tous — elle n'affiche l'anneau qu'au clavier, jamais à la souris.

Un bouton sans texte **doit** porter un `aria-label` ; la primitive
`src/components/ui/Button.tsx` l'impose par le typage, pas par la revue de code.

`prefers-reduced-motion` est honoré globalement : 146 transitions existaient pour
une seule prise en compte.

## Primitives — à utiliser plutôt qu'à refaire

| Composant | Rôle |
|---|---|
| `ui/Button.tsx` | Tout bouton. Cible, focus, nom accessible, état de chargement. |
| `ui/Readout.tsx` | Valeur instrumentale avec libellé et unité. |
| `ui/HardwareState.tsx` | État d'un sous-système matériel. |
| `ui/VisionControls.tsx` | Vision nocturne, assombrissement, densité. |

## Anti-patterns constatés dans ce dépôt

- Tailles de police en dur, en classe ou en style inline.
- `opacity-40/50/60` sur du texte pour le « mettre en retrait ».
- Pictogrammes textuels (`✕ ⚠ ✓ ▶ ⟳ ☀ ⬡`) en guise d'icônes — utiliser Lucide.
- `style={{…}}` plutôt que les tokens : 1110 occurrences recensées, c'est la
  raison pour laquelle l'interface dérive à chaque ajout.
