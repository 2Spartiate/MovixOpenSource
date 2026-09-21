# Movix Google TV — carte focus / D-pad / clavier

Checkpoint B — cartographie. Aucun conflit n'est corrigé dans ce checkpoint.

Référence d'audit : branche `agent/google-tv-roadmap-v1`, base après checkpoint A `6fe6a0bbc1a67600f1170834a9016da25777abb7`.

## 1. Légende

- **Natif** : focus navigateur naturel (`button`, `a`, `input`, etc.).
- **tabIndex** : focus explicitement ajouté/retiré.
- **Hover-only** : information/action principalement révélée à la souris.
- **Conflit D-pad** : une touche Arrow est déjà consommée par un raccourci ou un scroller.
- **TV cible** : comportement souhaité sur Android TV uniquement. Le clavier desktop existant doit rester inchangé hors mode TV.

## 2. Header

| Zone | Composant | DOM / focus actuel | Clavier actuel | Hover | Risque TV | TV cible |
|---|---|---|---|---|---|---|
| Logo Movix | `Header.tsx` | lien natif | activation Enter native | scale hover | cible décorative inutile | visible mais hors parcours TV |
| Telegram | `Header.tsx` | `a` natif, déjà `focus-visible` | Enter natif | couleur hover | détour externe depuis TV | visible mais non focusable TV, ou masqué si validé plus tard |
| Explore/navigation | `Header.tsx` | links + buttons | Enter natif | très hover-dominant | trop de cibles secondaires | conserver uniquement cibles utiles, menu navigable |
| Recherche desktop | `Header.tsx` | vrai `input` | saisie native | focus CSS déjà présent | bon point d'entrée, clavier TV/IME | focusable prioritaire |
| Clear recherche | `Header.tsx` | `button` | Enter natif | hover | petite cible secondaire | focusable seulement si utile |
| Recherche mobile | `Header.tsx` | button + input | focus programmatique à l'ouverture | hover | logique mobile inutile sur TV | privilégier input desktop / mode TV dédié |
| Notifications | `Header.tsx` | button | Enter natif | hover | overlay sans contrat focus | menu doit capturer/restaurer le focus |
| Profil | `ProfileMenu.tsx` | button + Links/buttons | Enter natif | nombreux `whileHover` | menu sans focus initial/restauration | bouton compte focusable, menu TV modal logique |

### Recherche / IME

Le header utilise déjà un vrai `input`, ce qui est compatible avec l'ouverture du clavier Android/Google TV. Aucune permission micro native n'est nécessaire pour bénéficier d'une éventuelle dictée fournie par l'IME.

## 3. Home / listes / carrousels

### EmblaCarousel

`src/components/EmblaCarousel.tsx` :

- carte/poster : interaction principale ;
- étoile watchlist overlay : `button` natif ;
- overlay texte : masqué en desktop jusqu'au `group-hover` ;
- flèche prev : `button`, révélée par hover du carrousel ;
- flèche next : `button`, révélée par hover ;
- “voir tout” / suppression : buttons.

**Risque TV :** les flèches de carrousel et l'étoile deviennent des étapes de focus concurrentes de la grille de posters, alors que l'utilisateur attend Left/Right = poster voisin.

**TV cible :**
- poster = cible principale ;
- prev/next retirés du parcours TV ;
- étoile overlay retirée du parcours TV, idéalement cachée ;
- Left/Right passe de poster en poster ;
- le carrousel suit le focus ;
- Up/Down change de rangée.

### SearchCard

`SearchGridCard` et `SearchListCard` :

- carte principale focusable selon le wrapper/lien ;
- étoile watchlist = button ;
- contenu descriptif grille masqué hors hover ;
- mode liste expose des actions supplémentaires.

**TV cible :** la carte est la cible primaire. Les actions secondaires doivent être accessibles depuis la fiche ou un menu explicite, pas comme étapes intermédiaires systématiques du D-pad.

### ContentRow

`ContentRow.tsx` possède deux buttons flèches gauche/droite, plus les items.

**Conflit TV :** Left/Right ne doit pas “tomber” sur les boutons de scroll.

**TV cible :** flèches visuelles ignorées/masquées en mode TV ; le changement de focus entraîne le scroll.

### HeroSlider

Les CTA sont de vrais liens/buttons. Les dots et bouton autoplay sont focusables.

**TV cible :** CTA principaux oui ; dots/autoplay à exclure du chemin par défaut sauf besoin démontré.

## 4. Pages Movies / TVShows — handlers locaux

`Movies.tsx` et `TVShows.tsx` possèdent une logique de carte Top 10 / hover qui enregistre un handler `keydown` sur un conteneur et bloque une liste incluant :

- `ArrowLeft`
- `ArrowRight`
- Space
- PageUp / PageDown
- Home / End.

Le handler appelle `preventDefault()`.

**Conflit D-pad direct :** tant que ce handler est actif, une couche spatiale parent ne peut pas supposer que Left/Right restent disponibles.

**TV cible :** la logique TV devra neutraliser ce blocage ou le conditionner au desktop/pointer ; elle ne doit pas modifier le comportement desktop hors TV.

## 5. Fiches MovieDetails / TVDetails

Les fiches contiennent notamment :

- CTA lecture ;
- favoris/watchlist ;
- tabs overview/details/videos/images ;
- saisons ;
- épisodes ;
- sources / actions secondaires ;
- liens externes ;
- carrousels associés.

La majorité de ces éléments sont des `button`/`a` natifs, donc techniquement focusables. Le problème principal n'est pas l'absence de focus HTML : c'est l'absence d'ordre spatial TV et la dépendance de nombreux états visuels au hover.

**TV cible :**
- Down = prochaine zone interactive, pas micro-scroll ;
- Up = zone précédente ;
- Left/Right dans les ensembles horizontaux (tabs, saisons, épisodes, cartes) ;
- retour depuis une sous-page/modal vers le déclencheur.

## 6. Player HLS principal

Fichier : `src/components/HLSPlayer.tsx`.

### Focusables actuels

Le player contient de nombreux vrais contrôles :

- play/pause ;
- rewind/forward ;
- volume ;
- progress/seek range ;
- settings ;
- sources ;
- qualité ;
- sous-titres ;
- vitesse ;
- Cast ;
- AirPlay ;
- PiP ;
- fullscreen ;
- prompts/overlays ;
- fermeture de panneaux.

Plusieurs zones utilisent déjà `focus-visible`. Certaines couches utilisent `tabIndex={showControls ? 0 : -1}`.

### Handler clavier global actuel

Un `document.addEventListener('keydown', handleKeyPress)` gère les raccourcis player.

Raccourcis Arrow explicites :

- **ArrowLeft → seek -10 s + `preventDefault()`**
- **ArrowRight → seek +10 s + `preventDefault()`**
- **ArrowUp → volume +5 % + `preventDefault()`**
- **ArrowDown → volume -5 % + `preventDefault()`**

Le helper `isPlayerControlInteractionTarget()` existe déjà et considère entre autres :

- `[data-player-controls]`
- `.control-bar`
- `.settings-menu`
- `.volume-slider`
- `.progress-bar`
- `button`
- `a`
- `input`
- `select`
- `textarea`
- `[role=button]`
- `[role=slider]`.

Mais, dans le grand handler clavier Arrow*, la garde générale actuelle porte sur le menu source et le verrouillage, **pas sur `isPlayerControlInteractionTarget(e.target)`**.

Le helper est en revanche utilisé dans les chemins click/touch.

### Conflit TV

Sur TV, un bouton player focusé recevrait ArrowRight, mais le handler global peut chercher dans la vidéo au lieu de déplacer le focus vers le contrôle voisin. Même problème pour les sliders et Up/Down.

### TV cible

- quand la cible est un contrôle interactif : D-pad = navigation/interaction du contrôle ;
- un `input[type=range]` conserve ses flèches natives lorsque voulu ;
- hors contrôles : les raccourcis seek/volume peuvent éventuellement rester actifs ;
- tant qu'un contrôle/menu possède le focus, `showControls` doit rester vrai ;
- Enter/DPAD_CENTER active le contrôle focusé.

## 7. LiveTVPlayer

Fichier : `src/components/LiveTVPlayer.tsx`.

Handler `window keydown` actuel :

- Space → play/pause ;
- **ArrowUp → volume +10 % + `preventDefault()`** ;
- **ArrowDown → volume -10 % + `preventDefault()`** ;
- F → fullscreen ;
- M → mute ;
- Escape → ferme settings ou player selon état.

La seule exclusion générale avant le switch est actuellement `HTMLInputElement` / `HTMLTextAreaElement`.

**Conflit TV :** buttons, links, select et autres contrôles ne sont pas exclus.

Le player peut aussi basculer vers un **iframe embed**.

**TV cible :**
- réutiliser une garde interactive commune ;
- focus visible sur toutes les commandes ;
- controls visibles sous `:focus-within`/état équivalent ;
- iframe traitée comme surface opaque avec fallback.

## 8. FranceTVPlayer

Fichier : `src/pages/FranceTV/FranceTVPlayer.tsx`.

Handler global `window keydown` :

- Space → play/pause ;
- **ArrowLeft → seek -10 s + preventDefault** ;
- **ArrowRight → seek +10 s + preventDefault** ;
- **ArrowUp → volume +10 % + preventDefault** ;
- **ArrowDown → volume -10 % + preventDefault** ;
- +/- → vitesse ;
- F → fullscreen ;
- M → mute ;
- Escape → ferme settings.

Comme LiveTVPlayer, il ignore uniquement input/textarea avant traitement.

**TV cible :** même contrat que HLSPlayer : une cible interactive ne doit pas être détournée par les raccourcis vidéo.

## 9. Progress / volume sliders

Les players utilisent des `input type="range"`.

Desktop : Left/Right sur un range ont une sémantique native utile.

TV cible :
- si le range a le focus, laisser le range consommer les flèches appropriées ;
- ne jamais appliquer simultanément navigation spatiale + seek global ;
- définir explicitement comment quitter le range en Up/Down selon layout.

## 10. Auto-hide / controls

Les trois players maintiennent `showControls`.

Risques :

- contrôle focusé qui devient invisible ;
- `pointer-events:none` pendant que le focus DOM subsiste ;
- menu settings qui se ferme visuellement sans restoration focus.

**TV cible :**
- focus entrant dans player controls => maintien visible ;
- focus sortant + lecture active => timeout autorisé ;
- settings/source menu ouvert => timeout suspendu ;
- fermeture du menu => focus rendu au bouton déclencheur.

## 11. Modals / menus

Exemples :

- settings player ;
- source picker ;
- notifications ;
- profile menu ;
- change-media modal ;
- watchlist/list menus ;
- prompts next episode/movie.

État actuel : plusieurs modals ont des buttons natifs et Escape partiellement géré, mais il n'existe pas de contrat global :

- capture du focus à l'ouverture ;
- ordre interne ;
- fermeture Back/Escape ;
- restoration du focus au trigger.

**TV cible :**
1. mémoriser le trigger ;
2. focus première option pertinente ;
3. garder le focus dans le panneau logique ;
4. Back/Escape ferme le panneau courant ;
5. restaurer le trigger.

## 12. Iframes cross-origin

Occurrences player explicites :

- `WatchMovie.tsx` : FStream + embeds génériques ;
- `WatchTv.tsx` : embeds génériques ;
- `WatchAnime.tsx` : embed ;
- `LiveTVPlayer.tsx` : embed live.

Ces iframes autorisent généralement autoplay/encrypted-media/PiP/fullscreen et proviennent de domaines tiers.

**Limite :** le parent ne peut pas lire/manipuler le DOM d'une iframe cross-origin.

**TV cible :**
- le parent peut focus l'iframe elle-même ;
- il ne doit pas inventer un graphe de contrôles internes ;
- conserver un bouton retour/source parent accessible ;
- privilégier les sources HLS/internal quand elles existent ;
- tester fournisseur par fournisseur le comportement D-pad natif.

## 13. Synthèse Arrow* : A/B/C

### A — Navigation D-pad souhaitée

Hors player opaque :

- Left/Right = cible spatiale gauche/droite ;
- Up/Down = cible spatiale rangée/zone précédente-suivante ;
- scroll = conséquence du focus via `scrollIntoView`, jamais action primaire.

### B — Raccourcis desktop actuels à préserver hors TV

- HLSPlayer : Left/Right seek ; Up/Down volume ;
- LiveTVPlayer : Up/Down volume ;
- FranceTVPlayer : Left/Right seek ; Up/Down volume ;
- divers raccourcis player (Space, F, M, J/L, etc.) ;
- blocages locaux de certaines cartes pour protéger leurs interactions desktop.

### C — Collisions à résoudre en mode TV

| Composant | Touche | Desktop actuel | TV attendu |
|---|---|---|---|
| HLSPlayer | Left/Right | seek ±10 s | contrôle voisin si focus contrôle ; seek seulement hors graphe si retenu |
| HLSPlayer | Up/Down | volume ±5 % | rangée/contrôle vertical ; volume via slider/bouton |
| LiveTVPlayer | Up/Down | volume ±10 % | navigation controls |
| FranceTVPlayer | Left/Right | seek ±10 s | navigation controls |
| FranceTVPlayer | Up/Down | volume ±10 % | navigation controls |
| Movies/TVShows Top10 | Left/Right | preventDefault local | carte voisine |
| Carrousels | Left/Right | boutons/scroll/Embla | poster voisin + scrollIntoView |

## 14. Propagation et preventDefault — règle future

La couche TV ne doit pas installer un `preventDefault()` global aveugle.

Ordre recommandé futur :

1. détecter si modal/player panel possède le focus ;
2. détecter contrôles natifs spéciaux (input/range/select/textarea) ;
3. laisser les composants qui ont une sémantique TV explicite traiter la touche ;
4. sinon calcul spatial ;
5. `preventDefault()` seulement lorsqu'une navigation TV est réellement exécutée.

## 15. Scroll

Le comportement web actuel contient plusieurs `scrollTo`, Embla `scrollTo` et scrollers locaux.

**TV cible :**
- focus d'abord ;
- `scrollIntoView({block:'nearest'/'center', inline:'nearest'/'center'})` ensuite ;
- éviter un ArrowDown = scroll de N pixels ;
- garder la dernière position horizontale par rangée lorsque cela améliore le retour vertical.

## 16. Conclusion checkpoint B

Le DOM Movix fournit déjà beaucoup de contrôles sémantiques natifs. Le chantier TV n'a donc pas besoin de réinventer tous les widgets.

Le vrai problème est le **routage des touches** :

- aujourd'hui Arrow* signifie parfois scroll, seek, volume, blocage local ou navigation native ;
- sur TV, Arrow* doit d'abord signifier déplacement de focus ;
- les raccourcis desktop doivent rester inchangés hors TV.

La future couche doit donc être activée par un signal TV explicite et coopérer avec les handlers existants plutôt que les écraser globalement.
