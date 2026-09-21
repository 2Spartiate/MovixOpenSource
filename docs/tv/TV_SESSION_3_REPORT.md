# MOVIX Google TV — Session 3 report

## Identité

- Dépôt : `2Spartiate/MovixOpenSource`
- Branche : `agent/google-tv-roadmap-v1`
- HEAD initial autoritaire : `8a70568113b67b1c18b636446c3076c271fd3951`
- HEAD d'implémentation validé avant ce rapport : `b7b853a3555ad368fc911d4eae5ccbf80f75412a`
- CI finale d'implémentation : **PASS**
- Workflow : `Android TV foundations`
- Run : `35650148962`
- Validation matérielle Google TV : **NON EFFECTUÉE / NON DÉCLARÉE**

Le commit contenant ce rapport constitue le checkpoint AE de clôture.

## Résumé global

Session 3 termine le nettoyage UI TV demandé, supprime le gate publicitaire Movix avant lecture pour le runtime Google TV sans simuler d'impression ni de clic, puis adapte les trois lecteurs internes principaux au D-pad :

- HLSPlayer ;
- LiveTVPlayer ;
- FranceTVPlayer.

La session ajoute également :

- navigation TV des menus player ;
- protection de l'auto-hide lorsque le focus est dans les contrôles ;
- résolution des conflits Arrow seek/volume ;
- hiérarchie Back TV avant navigation WebView ;
- traitement best-effort des iframes externes sans contourner la Same-Origin Policy ;
- 36 tests contractuels supplémentaires/étendus portant le total TV exécuté par le workflow à 85 tests.

## Checkpoints

| Checkpoint | Statut | Commit | Résumé |
|---|---|---|---|
| R | PASS | `af351461` | Telegram masqué TV-only ; logo conservé hors focus ; URL bar forcée masquée TV-only ; nav basse conservée |
| S | PASS | `64ba52ad` | Audit exhaustif du gate pub général, Live TV et SwiftFlux |
| T | PASS | `f8985cb8` | Bypass TV explicite des gates Movix sans faux VIP, faux crédit ni ouverture pub |
| U | PASS | `0293e871` | Contrat D-pad player/global documenté |
| V | PASS | `dd4d9640` | Auto-hide HLS interdit tant qu'un contrôle possède le focus |
| W | PASS | `ab1bffe8` | Arrow HLS cède aux contrôles focusés sur TV ; raccourcis desktop conservés |
| X | PASS | `c613e938` | Contrôles HLS accessibles D-pad ; progress slider TV ; volume focus-within ; Cast/focus |
| Y | PASS | `f739e65a` | Settings/source/quality/subtitles transformés en menus TV navigables avec restauration de focus |
| Z | PASS | `a3c1b817` | LiveTVPlayer adapté : focus, Arrow, volume, serveurs, Cast/AirPlay/fullscreen |
| AA | PASS | `9fb655e0` | FranceTVPlayer adapté : conflits Left/Right, focus, menus, auto-hide |
| AB | PASS | `c3d53f4b` | Back TV priorise player overlays/fullscreen avant historique WebView |
| AC | PASS | `fec44a35` | Limites iframe/SOP documentées ; iframe externe = cible TV unique |
| AD | PASS | `b0e898b9` + `b7b853a3` | Corrections issues de CI puis validation complète 85/85 + frontend + Android |
| AE | PASS | commit contenant ce fichier | Rapport et clôture Session 3 |

## R — UI TV finale

### Logo MOVIX

Le logo reste visible et conserve son rendu/placement.

En runtime TV il reste hors graphe spatial grâce au contrat déjà présent `data-tv-ignore-focus`.

### Telegram

L'icône Telegram est désormais réellement masquée sur TV via le marqueur stable :

`[data-tv-header-telegram]`

dans le scope `.movix-tv`.

Le comportement téléphone/desktop n'est pas modifié.

### Barre d'adresse basse

`BrowserScreen` calcule maintenant :

`effectiveShowUrlBar = isTV ? false : uiPrefs.showUrlBar`

Conséquences :

- TV : URL bar toujours masquée ;
- téléphone : préférence existante respectée ;
- la nav basse `showNavBar` reste indépendante ;
- Back / Forward / Reload / Home / Settings ne sont pas supprimés par ce changement.

## S/T — Gate publicitaire Movix

Audit : `docs/tv/TV_PREPLAY_AD_GATE_AUDIT.md`.

Trois chemins Movix ont été identifiés :

1. gate général `AdFreePopupContext` / `AdFreePlayerAds` pour Watch ;
2. gate Live TV avec `sessionStorage.livetv_ad_credits` ;
3. étape publicitaire SwiftFlux avant Turnstile.

Un helper frontend explicite a été ajouté :

`src/utils/tvRuntime.ts`

qui teste `window.MOVIX_TV === true`.

### Politique TV

Sur TV :

- le gate général n'est pas ouvert ;
- le player est autorisé à suivre son chemin normal ;
- Live TV ouvre directement la chaîne sans lire ni créer de crédit publicitaire ;
- SwiftFlux saute seulement son étape publicitaire mais conserve Turnstile et la résolution normale.

La Session 3 ne :

- simule pas de clic ;
- n'ouvre pas une pub invisiblement ;
- ne crée pas une fausse impression ;
- ne se fait pas passer pour VIP ;
- ne modifie pas les publicités internes des lecteurs tiers.

## U — Contrat D-pad player

Document : `docs/tv/TV_PLAYER_DPAD_CONTRACT.md`.

Frontière retenue :

- input/range/slider/éditeur : le contrôle natif possède ses flèches ;
- bouton player : navigation spatiale TV ;
- zone vidéo sans contrôle interactif focusé : raccourcis seek/volume historiques disponibles ;
- panneau player ouvert : le panneau devient le scope prioritaire ;
- le moteur spatial global ne consomme une flèche que lorsqu'il effectue réellement un déplacement.

## V/W/X — HLSPlayer

### Auto-hide

Le player détecte désormais le focus dans `[data-player-controls]`.

- focus entrant : `showControls=true` ;
- timers d'auto-hide annulés ;
- callbacks d'auto-hide vérifient le focus avant masquage ;
- focus sortant : délai normal réarmé ;
- cleanup du timeout au démontage.

### Conflits Arrow

Sur TV uniquement, si une cible interactive player possède le focus :

- ArrowLeft/Right ne déclenchent pas le seek global ;
- ArrowUp/Down ne déclenchent pas le volume global.

Desktop conserve les raccourcis historiques :

- Space/K ;
- J/L ;
- Home/End ;
- M ;
- F ;
- P ;
- C ;
- Arrow seek/volume hors contrôle TV focusé.

### Contrôles

Les zones principales portent des groupes de focus TV.

La progression possède un comportement slider TV natif :

- Left/Down : -10 s ;
- Right/Up : +10 s ;
- Home : début ;
- End : fin.

Le volume s'ouvre aussi par `focus-within`, plus seulement au hover.

Cast est explicitement focusable et les principales commandes exposent des labels accessibles.

## Y — Menus HLS

Le bouton Settings est mémorisé comme trigger.

À l'ouverture TV :

- autofocus sur l'onglet actif ;
- source/qualité conserve son autofocus existant.

Dans le menu :

- Up/Down navigue entre options ;
- sliders/inputs gardent leurs propres flèches ;
- Escape ferme le panneau courant.

À la fermeture :

- le focus retourne sur le bouton Settings.

## Z — LiveTVPlayer

Adaptations :

- contrôle focusé maintient l'UI visible ;
- Arrow volume global cède au contrôle focusé sur TV ;
- slider volume visible via hover **et** focus-within ;
- panneau serveurs = scope TV ;
- autofocus serveur ;
- Up/Down interne ;
- Escape local ;
- focus restauré au trigger ;
- LIVE, Cast, AirPlay et fullscreen exposés proprement au focus.

Une erreur d'attribut découverte par la CI a été corrigée au checkpoint AD : un label fullscreen avait été appliqué accidentellement au bouton Play/Pause, tandis que le vrai fullscreen/AirPlay/trigger settings manquaient de leurs attributs. Le HEAD validé contient la correction.

## AA — FranceTVPlayer

Le player n'intercepte plus les flèches TV quand une commande interactive possède le focus.

Les raccourcis historiques restent disponibles hors contrôle focusé.

Ajouts :

- protection auto-hide ;
- groupes de contrôles TV ;
- volume focus-within ;
- menu settings TV ;
- autofocus ;
- Up/Down ;
- Escape local ;
- restauration du focus trigger.

## AB — Back / Escape

Le shell Android TV ne fait plus immédiatement `goBack()` lorsqu'il existe un historique.

Il injecte d'abord un événement annulable :

`movix-tv-back`

Puis :

- si un player appelle `preventDefault()`, son état local consomme Back ;
- sinon le script appelle `window.history.back()`.

### HLS

Priorités locales :

1. lock ;
2. settings ;
3. Cast/menu saison/menu épisodes ;
4. Segment Studio / info / shortcuts / volume ;
5. prompt skip/vote ;
6. Up Next épisode/film ;
7. fullscreen ;
8. sinon Back reste non consommé et le WebView quitte la route.

### Live TV

1. settings ;
2. fullscreen ;
3. fermeture du player overlay.

### France TV

1. settings ;
2. fullscreen ;
3. sortie de route player.

Le comportement téléphone conserve le chemin `webViewRef.current?.goBack()`.

## AC — Iframes externes

Document : `docs/tv/TV_EXTERNAL_PLAYER_LIMITS.md`.

Le runtime Android reste volontairement injecté **main-frame only**.

Sur TV :

- les iframes Frembed/LiveTV embed deviennent une cible focusable unique ;
- Movix ne tente pas de naviguer leur DOM interne ;
- `VideoPlayer` n'essaie plus d'accéder au document Frembed en runtime TV ;
- le clavier interne dépend du support du fournisseur tiers.

Aucun contournement de Same-Origin Policy n'a été ajouté.

## AD — Validation

### CI autoritaire

Run : `35650148962`

HEAD : `b7b853a3555ad368fc911d4eae5ccbf80f75412a`

Conclusion : **success**.

### Tests contractuels

Résultat :

- tests : **85**
- pass : **85**
- fail : **0**

Le workflow couvre les contrats Session 1/2 et les nouveaux contrats Session 3 :

- runtime TV ;
- bootstrap WebView ;
- moteur spatial ;
- découverte focus ;
- D-pad runtime ;
- header ;
- gate pub ;
- focus/auto-hide HLS ;
- conflits raccourcis HLS ;
- navigation HLS ;
- menus player ;
- LiveTV ;
- FranceTV ;
- Back ;
- iframes externes ;
- carrousels ;
- restauration de focus.

### TypeScript

`npx tsc --noEmit` : **PASS**.

### Userscript

`npm run build:userscript` : **PASS**.

Taille générée observée : 186.1 KB.

### Frontend

Build production Vite du workflow : **PASS**.

### Android

Le workflow a exécuté avec succès :

- `:app:processDebugMainManifest`
- `:app:assembleDebug`
- assertions manifest TV/mobile.

Gradle :

`BUILD SUCCESSFUL`

Manifest packagé vérifié :

`app/build/intermediates/packaged_manifests/debug/processDebugManifestForPackage/AndroidManifest.xml`

Les warnings de dépendances/deprecations historiques ne sont pas traités dans cette session.

## Fichiers principaux modifiés

### Shell / TV

- `.github/workflows/android-tv-foundations.yml`
- `app/src/injection/tv-bootstrap.ts`
- `app/src/screens/BrowserScreen.tsx`

### Frontend players / gates

- `src/context/AdFreePopupContext.tsx`
- `src/pages/LiveTV.tsx`
- `src/components/SwiftfluxGate.tsx`
- `src/utils/tvRuntime.ts`
- `src/utils/playerControlInteraction.ts`
- `src/components/HLSPlayer.tsx`
- `src/components/HLSPlayerSettingsPanel.tsx`
- `src/components/LiveTVPlayer.tsx`
- `src/pages/FranceTV/FranceTVPlayer.tsx`
- `src/components/VideoPlayer.tsx`

### Documentation

- `docs/tv/TV_PREPLAY_AD_GATE_AUDIT.md`
- `docs/tv/TV_PLAYER_DPAD_CONTRACT.md`
- `docs/tv/TV_EXTERNAL_PLAYER_LIMITS.md`
- `docs/tv/TV_SESSION_3_REPORT.md`

### Tests Session 3

- `app/tests/tvPreplayAdGateContract.test.mjs`
- `app/tests/tvHlsControlsFocusContract.test.mjs`
- `app/tests/tvHlsDpadShortcutContract.test.mjs`
- `app/tests/tvHlsRemoteNavigationContract.test.mjs`
- `app/tests/tvPlayerMenusContract.test.mjs`
- `app/tests/tvLivePlayerDpadContract.test.mjs`
- `app/tests/tvFrancePlayerDpadContract.test.mjs`
- `app/tests/tvPlayerBackContract.test.mjs`
- `app/tests/tvExternalPlayerLimitsContract.test.mjs`

## Risques / limites restantes

### Validation matérielle

Aucune télécommande Google TV réelle n'a été manipulée pendant cette session.

Il reste donc à confirmer sur matériel :

- géométrie de focus ressentie dans chaque player ;
- keycodes réels du bouton Back selon modèle ;
- comportement Cast/PiP côté matériel ;
- retour du focus depuis certains composants natifs/tiers ;
- iframes tierces et leur support clavier propre.

### Iframes cross-origin

Leur DOM interne reste hors contrôle Movix par conception.

Un provider sans navigation clavier restera partiellement utilisable au mieux.

### Variabilité des sources

Certains players/source paths dépendent d'APIs et de providers externes. Les tests de contrat vérifient le code et la hiérarchie d'interaction, pas la disponibilité réseau de chaque provider.

### Warnings historiques

Les audits npm et warnings Gradle/deprecations déjà présents ne sont pas corrigés ici pour éviter les modifications hors scope.

## Prochaine reprise recommandée

Session 3 logicielle est terminée.

La prochaine étape utile est un **smoke-test matériel Google TV** sur l'APK debug construit depuis le HEAD final, avec une matrice courte :

1. home/header/carrousels ;
2. démarrage direct d'un film sans gate pub ;
3. HLS : play, seek slider, volume, settings/source/subtitles, fullscreen, Back ;
4. Live TV : chaîne directe, volume, serveurs, Cast/AirPlay visibles, fullscreen, Back ;
5. France TV : seek, settings, fullscreen, Back ;
6. iframe externe : entrée de focus + comportement D-pad best effort ;
7. vérifier qu'aucun contrôle focusé ne disparaît par auto-hide.

Les éventuelles corrections matérielles doivent reprendre sur cette même branche, sans toucher `main` ni l'upstream.
