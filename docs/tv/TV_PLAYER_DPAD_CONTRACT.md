# Movix Google TV — contrat D-pad des players

## But

Ce document fixe la frontière entre le moteur spatial global injecté par le shell Google TV et les comportements clavier internes des players.

Il s'applique d'abord à `HLSPlayer`, puis sert de contrat commun à `LiveTVPlayer` et `FranceTVPlayer`.

## État observé au checkpoint U

### Moteur spatial global

`app/src/injection/tv-dpad-runtime.ts` écoute `keydown` en **capture** sur `document`.

Il refuse actuellement de traiter les flèches lorsque la cible est dans :

- `[data-tv-consume-arrows]` ;
- `[data-tv-player-control]` ;
- `[data-tv-dpad-scope="native"]` ;
- `[role="slider"]` ;
- inputs d'édition, textarea, select et contenteditable.

Cette règle existante protège bien les contrôles natifs, mais `data-tv-player-control` ne doit pas devenir un marqueur posé sur toute la barre : cela retirerait tous les boutons player du moteur spatial.

### HLSPlayer

Le player possède déjà deux racines `data-player-controls` :

- le groupe central rewind / play / forward ;
- la barre de contrôle basse.

Le helper `isPlayerControlInteractionTarget()` reconnaît notamment `[data-player-controls]`, `.control-bar`, `.settings-menu`, `.volume-slider`, `.progress-bar`, boutons, liens, inputs, selects et rôles button/slider.

Ce helper sert déjà aux interactions pointeur/tactile pour garder les contrôles visibles.

Le clavier HLS est abonné en **bubble** sur `document`. Il ignore les `input` et `textarea`, ainsi que le menu source, mais intercepte encore globalement :

- Left / Right → seek ±10 s ;
- Up / Down → volume ±5 % ;
- Home / End → début / fin ;
- Escape → certains overlays ;
- Space/K, J/L, M, F, P, C et autres raccourcis historiques.

Le volume possède un vrai `input[type=range]`.

Le menu source possède déjà une logique d'autofocus de la première option et de scroll de la cible focusée.

Les overlays `SkipSegmentPrompt`, `UpNextPanel`, `SegmentStudio` et `SegmentVotePrompt` contiennent de vrais boutons ; `SegmentStudio` contient aussi des champs texte qui doivent conserver leur clavier natif.

## Contrat de propriété des touches

### 1. Contrôle natif / éditable

Exemples :

- `input[type=range]` ;
- `role=slider` ;
- input texte / numérique ;
- textarea ;
- select ;
- contenteditable ;
- contrôle explicitement marqué `data-tv-dpad-scope="native"`.

**Propriétaire : le contrôle lui-même.**

Le moteur spatial global ne consomme pas les flèches. Le player ne doit pas non plus les convertir en seek/volume si cela empêcherait le comportement natif.

### 2. Bouton / lien dans le player

Exemples :

- Play/Pause ;
- subtitles ;
- settings ;
- source ;
- Cast ;
- PiP ;
- fullscreen ;
- boutons d'overlays.

**Propriétaire primaire : navigation spatiale TV.**

LEFT/RIGHT/UP/DOWN doivent pouvoir déplacer le focus entre cibles. Ces boutons ne doivent donc pas être exclus en bloc par `data-tv-player-control`.

Le player peut traiter Enter/OK/clic comme activation normale.

### 3. Zone vidéo sans contrôle interactif focusé

Quand aucune commande interactive du player ne possède le focus :

- Left / Right peuvent conserver seek ±10 s ;
- Up / Down peuvent conserver volume ;
- Space/K, J/L, M, F, P, C, Home/End restent disponibles ;
- desktop continue à conserver ces raccourcis.

Cette politique maintient le comportement clavier historique tout en évitant qu'une télécommande détourne les flèches lorsqu'un bouton ou un menu est actif.

### 4. Menu/panneau player ouvert

Le panneau devient un scope d'interaction prioritaire.

- ouverture : mémoriser le trigger ;
- autofocus : première option pertinente ou option active ;
- Up/Down : option précédente/suivante ;
- Left/Right : uniquement si le widget courant l'exige ; sinon navigation spatiale cohérente du panneau ;
- Enter/OK : sélectionner ;
- Back/Escape : fermer le panneau courant, sans fermer le player ;
- fermeture : restaurer le focus sur le trigger.

Le focus ne doit jamais fuir derrière un panneau modal/overlay tant que celui-ci est actif.

## Sémantique des marqueurs

### `data-player-controls`

Marqueur de **zone de contrôles du player**.

Usages :

- détecter qu'un focus appartient à la barre/au groupe du player ;
- empêcher l'auto-hide pendant ce focus ;
- distinguer les raccourcis vidéo des interactions de commandes.

Il ne signifie pas « consommer nativement toutes les flèches ».

### `data-tv-dpad-scope="native"` / `data-tv-consume-arrows`

À réserver aux widgets qui ont réellement besoin de leurs flèches : sliders, champs/contrôles composites spécifiques.

### `data-tv-player-control`

Le runtime Session 2 le traite actuellement comme exclusion globale. Pour Session 3, il ne doit **pas** être posé comme attribut générique sur tous les boutons. Si ce marqueur reste utile, son usage doit être limité aux contrôles qui prennent réellement possession des flèches, ou la politique runtime devra être affinée explicitement.

## Ordre des listeners

Point important :

1. le runtime TV écoute `document.keydown` en capture ;
2. HLSPlayer écoute `document.keydown` en bubble.

Donc la décision « navigation spatiale ou contrôle natif » doit être correcte dès la capture.

Le moteur global ne doit appeler `preventDefault()/stopPropagation()` que s'il a réellement déplacé le focus. Si aucun déplacement spatial n'est possible, l'événement reste disponible au player, sauf contrôle natif qui le gère lui-même.

## Auto-hide

Toute racine `[data-player-controls]` doit respecter :

- `focusin` → `showControls=true` ;
- tant que `document.activeElement` est descendant des contrôles, aucun timer ne peut masquer la barre ;
- `focusout` vers l'extérieur → réarmement normal de l'auto-hide ;
- aucun timer obsolète ne doit masquer des contrôles pendant un focus TV.

Cette règle complète les gardes existantes pour settings, Cast, volume, overlays et animations de seek.

## Menus/settings/source/subtitles/quality

`HLSPlayerSettingsPanel` contient déjà de vrais boutons et le menu source possède déjà un autofocus partiel. La Session 3 doit généraliser ce comportement :

- trigger ref par panneau ;
- racine identifiable du panneau ;
- autofocus reproductible ;
- navigation verticale ;
- retour du focus au trigger ;
- Escape/Back local.

Les composants sources/quality/subtitles imbriqués doivent hériter de ce contrat sans transformer leurs sliders ou champs en cibles de navigation spatiale ordinaires.

## Overlays secondaires

`SkipSegmentPrompt`, `UpNextPanel`, `SegmentStudio` et `SegmentVotePrompt` sont des scopes secondaires.

Ils doivent :

- exposer leurs boutons au D-pad ;
- préserver les inputs de `SegmentStudio` ;
- être fermés avant le player par Back/Escape lorsque cela est applicable ;
- empêcher une restauration de focus derrière un overlay encore ouvert.

## Règle de compatibilité desktop/mobile

Toutes les adaptations doivent être conditionnées par le runtime TV ou être des améliorations sémantiques neutres.

Desktop garde ses raccourcis historiques, son hover et son pointeur. Mobile/tactile garde ses gestes et timeouts actuels.

## Séquence d'implémentation

- V : garantir la visibilité des contrôles tant qu'un descendant est focusé ;
- W : empêcher les raccourcis Arrow HLS de voler les flèches d'un contrôle ;
- X : rendre la barre et les commandes navigables à la télécommande ;
- Y : transformer settings/source/quality/subtitles en scopes TV avec autofocus et restauration ;
- Z / AA : appliquer le même contrat à LiveTVPlayer et FranceTVPlayer ;
- AB : consolider la hiérarchie Back/Escape.
