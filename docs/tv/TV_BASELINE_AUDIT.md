# Movix Google TV — baseline technique

Checkpoint A — audit uniquement. Aucun comportement produit n'est modifié par ce checkpoint.

## 1. Référence auditée

- Dépôt : `2Spartiate/MovixOpenSource`
- Branche : `agent/google-tv-roadmap-v1`
- HEAD de départ : `fbe2271b1b79bacbdefb60800b87820bc344728c`
- Base historique de la branche : `main@ff56b3c57511c84cedc89956ba05dedba7630f1d`
- Upstream `movixcorp/MovixOpenSource` : lecture seule.
- React Native : `0.75.4`
- `react-native-webview` : `13.12.5`
- Android : compile/target SDK 35, min SDK 24, Gradle 8.10.2, AGP 8.7.3, Kotlin 1.9.24, Java 17.
- Package / namespace : `com.movix.app`.
- Version Android constatée : `2.6.1`, versionCode 38.

## 2. Architecture Android actuelle

L'application Android est une application React Native contenant principalement une WebView Movix. `MainActivity` étend `ReactActivity` et contient déjà les intégrations PiP. `MainApplication` enregistre les packages natifs DNS, updater, Cast, media proxy, maintien écran éveillé et PiP.

Le manifest contient actuellement :

- permission Internet/réseau ;
- foreground service connecté pour Cast ;
- `REQUEST_INSTALL_PACKAGES` pour l'updater ;
- activité `.MainActivity` en `singleTask`, PiP activé ;
- launcher téléphone classique `android.intent.category.LAUNCHER` ;
- deep links `https://movix.tax` et sous-domaines ;
- service VPN DNS ;
- service foreground Cast ;
- `FileProvider` basé sur `${applicationId}.updateprovider` ;
- bootstrap Google Cast ;
- receiver PiP.

Il ne contient actuellement ni `LEANBACK_LAUNCHER`, ni feature `android.software.leanback`, ni déclaration `android.hardware.touchscreen required=false`, ni `android:banner`.

La ressource Android ne contient pas de bannière TV. Elle contient les icônes launcher dans les variantes mipmap mdpi → xxxhdpi. Le dépôt contient aussi des logos Movix hors ressources Android (`movix.png`, `public/movix*.png`, logo iOS), mais aucun asset Android 16:9 TV déjà matérialisé.

## 3. Architecture React Native / BrowserScreen

`BrowserScreen.tsx` est le conteneur principal de l'expérience navigateur.

Responsabilités constatées :

- résolution de l'URL Movix primaire + mirrors via `AddressContext` ;
- montage de `WebViewBrowser` ;
- état navigation `canGoBack/canGoForward` ;
- toolbar RN Android/iOS ;
- modal de paramètres RN ;
- état PiP ;
- Android Back via `BackHandler`.

Hiérarchie Back actuelle :

1. fermer les paramètres RN s'ils sont ouverts ;
2. sinon `WebView.goBack()` si l'historique WebView le permet ;
3. sinon rendre `false` au système.

Il n'existe actuellement aucune notion `isTV` dans `BrowserScreen`.

## 4. Chargement Movix dans la WebView

La cible primaire configurée est `https://movix.tax`, avec mécanisme de mirrors. Android utilise actuellement un user-agent mobile Pixel 8 explicite :

`Mozilla/5.0 (Linux; Android 14; Pixel 8) ... Mobile Safari/537.36`

Conclusion : le user-agent ne doit pas devenir la source de vérité TV. Une Google TV continuerait sinon à être présentée comme téléphone Android.

`WebViewBrowser.tsx` charge `source={{ uri: url }}` et active notamment :

- JavaScript ;
- DOM storage ;
- lecture média sans interaction obligatoire ;
- fullscreen vidéo ;
- mixed content `always` ;
- fenêtres multiples avec filtrage des pop-ups ;
- origin whitelist HTTP/HTTPS/about:srcdoc.

## 5. Points d'injection JS disponibles

Le point central est `app/src/injection/inject.ts`, appelé par `WebViewBrowser` via `buildInjectedJavaScript()`.

L'ordre d'injection actuel avant contenu est :

1. Cast shim ;
2. PiP shim ;
3. playback-awake shim ;
4. bridge runtime ;
5. userscript Movix généré.

L'ensemble est injecté avec :

`injectedJavaScriptBeforeContentLoaded={injectedJS}`

et seulement dans la frame principale :

`injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}`.

Le bridge possède déjà un verrou d'idempotence (`window.__MOVIX_BRIDGE_READY`). `WebViewBrowserRef` expose aussi `injectJavaScript(script)`, ce qui permet une injection postérieure si nécessaire.

Le userscript embarqué provient de `userscript/movix.user.js` et est matérialisé en TypeScript par `app/scripts/build-userscript.js`.

**Point recommandé pour TV :** étendre l'infrastructure d'injection déjà centralisée, plutôt que modifier le userscript général ou le site distant.

## 6. Updater Android

L'updater est natif et déjà complet :

- check de version depuis le manifest du dépôt configuré ;
- téléchargement via Android `DownloadManager` ;
- SHA-256 ;
- autorisation sources inconnues ;
- installation via `FileProvider`.

`versionCheck.ts` construit actuellement le manifest à partir de `/raw/refs/heads/main/app/version.json`.

Risque TV : une APK de test utilisant le même package mais une signature différente peut ne pas remplacer proprement l'APK upstream ; en outre l'updater continuerait à suivre le manifest `main`. La variante/package de test devra être décidée explicitement avant diffusion régulière.

## 7. Inventaire des principales zones focusables web

### Header

`src/components/Header.tsx` :

- logo Movix : lien ;
- lien Telegram : anchor ;
- navigation/explore : anchors, `Link`, buttons ;
- recherche desktop : vrai `input` ;
- bouton clear recherche ;
- recherche mobile : button + input ;
- notifications : button ;
- profil : `ProfileMenu` ;
- autocomplete : buttons/links.

Le header possède déjà quelques styles `focus-visible`, mais il n'existe pas de contrat TV global.

### Compte / profil

`ProfileMenu.tsx` et `ProfileSwitcher.tsx` utilisent des boutons/links natifs, donc focusables de base. Le menu n'implémente toutefois pas encore un piège/restauration de focus spécifique TV.

### Cartes et rangées

Les cartes principales ne vivent pas dans un unique `MovieCard`/`TVCard`. Les implémentations centrales observées sont notamment :

- `EmblaCarousel.tsx` ;
- `SearchCard.tsx` ;
- `ContentRow.tsx` ;
- cartes locales/pages dans Home, Movies, TVShows, Profile, détails.

`EmblaCarousel` possède :
- poster/carte principale cliquable ;
- étoile watchlist en overlay ;
- overlay texte visible au hover ;
- boutons prev/next de carrousel qui apparaissent au hover ;
- boutons “voir tout”/suppression selon contexte.

`SearchCard` possède :
- carte principale ;
- étoile watchlist overlay ;
- contenu descriptif hover-only en grille ;
- actions additionnelles en mode liste.

`ContentRow` expose explicitement des boutons flèche gauche/droite.

### Fiches

`MovieDetails.tsx` et `TVDetails.tsx` sont de grandes pages comprenant CTA, tabs, épisodes/saisons, listes et actions. De nombreux boutons sont natifs, mais la mise en évidence est majoritairement hover desktop.

## 8. Handlers clavier Arrow* observés

Les conflits majeurs sont détaillés dans `TV_FOCUS_KEYBOARD_MAP.md` au checkpoint B, mais la baseline est déjà claire :

- `HLSPlayer.tsx` installe un `document.addEventListener('keydown', ...)` et consomme :
  - Left/Right = seek -10/+10 ;
  - Up/Down = volume ;
- `LiveTVPlayer.tsx` installe un handler window ; Up/Down = volume ;
- `FranceTVPlayer.tsx` installe un handler window ; Left/Right = seek, Up/Down = volume ;
- `Movies.tsx` et `TVShows.tsx` installent localement des handlers qui bloquent notamment Left/Right sur certaines cartes Top 10 / hover states.

Dans `HLSPlayer`, `isPlayerControlInteractionTarget` existe et est déjà utilisé pour les interactions pointer/touch, mais le grand handler clavier Arrow* ne l'utilise pas comme garde générale. C'est un conflit direct avec une télécommande D-pad.

## 9. Composants hover-only / hover-dominants

Principaux cas identifiés :

- `EmblaCarousel` : overlay descriptif, étoile watchlist, boutons prev/next ;
- `SearchCard` : overlay descriptif et étoile watchlist ;
- Movies / TVShows / détails : effets poster et boutons révélés/valorisés au hover ;
- players : contrôles avec styles hover et volume slider à expansion hover dans certaines variantes ;
- menus/actions compte : feedback principalement hover.

Le mode TV doit fournir une alternative focus-visible/focus-within au lieu d'essayer d'émuler artificiellement la souris.

## 10. Players internes

Players internes importants :

- `src/components/HLSPlayer.tsx` — player principal, très riche : seek, volume, sources, qualité, sous-titres, vitesse, Cast, AirPlay, PiP, fullscreen, prompts, overlays ;
- `src/components/LiveTVPlayer.tsx` — vidéo HLS/native ou iframe embed, contrôles custom ;
- `src/pages/FranceTV/FranceTVPlayer.tsx` — player custom vidéo + settings ;
- `VideoPlayer.tsx`, `VideoJSPlayer.tsx`, `MovieVideoPlayer.tsx`, `FloatingPlayer.tsx` — variantes/utilitaires à garder dans le périmètre de non-régression ;
- `PlayerOverlayPortal.tsx` et utilitaires overlay pour menus/panneaux.

Les contrôles principaux sont en grande partie de vrais `button`/`input[type=range]`, ce qui est une bonne base pour le D-pad une fois les handlers globaux neutralisés sur cibles interactives.

## 11. Iframes cross-origin

Cas explicites trouvés :

- `WatchMovie.tsx` : plusieurs iframes embed selon source ;
- `WatchTv.tsx` : iframe embed ;
- `WatchAnime.tsx` : iframe embed ;
- `LiveTVPlayer.tsx` : iframe pour flux embed.

Ces documents proviennent de lecteurs tiers et peuvent être cross-origin. La couche parent Movix ne peut donc pas garantir l'accès DOM ni la navigation de leurs contrôles internes.

Conséquence : le contrat TV doit distinguer clairement player interne contrôlable et player tiers opaque. Aucun rapport ne doit prétendre à une navigation complète dans une iframe cross-origin sans coopération du provider.

## 12. Auto-hide des contrôles players

Les players maintiennent un état `showControls` avec timeouts.

Risques TV :

- le focus peut rester techniquement sur un bouton devenu invisible/non interactif ;
- un menu peut disparaître pendant qu'une télécommande l'utilise ;
- le volume slider peut rester dépendant du hover.

Cible future : tant que le focus DOM est à l'intérieur de la zone de contrôles ou d'un menu player, les contrôles doivent rester visibles.

## 13. GitHub Actions / capacité de build

À ce HEAD, `.github/workflows/` ne contient qu'un workflow :

- `ios-unsigned.yml`.

Il n'existe donc **aucun workflow Android** actuel sur lequel s'appuyer directement.

Le workflow iOS fournit néanmoins des conventions utiles :

- Node 22 ;
- `npm ci` dans `app` ;
- génération userscript via `npm run build:userscript` ;
- actions GitHub épinglées par SHA ;
- tests de contrats bridge/native avant packaging.

Le projet Android possède un wrapper Gradle 8.10.2 et la configuration Java 17 nécessaire pour construire via `app/android/gradlew`, mais aucune CI Android n'est encore déclarée.

## 14. Risques de régression mobile / desktop

1. **Handlers Arrow globaux** : les modifier sans garde TV peut casser les raccourcis desktop.
2. **Hover** : remplacer plutôt qu'ajouter des règles TV casserait souris/desktop.
3. **WebView injection** : une injection non idempotente peut doubler listeners/observers à chaque navigation.
4. **User-agent** : changer l'UA global pour “faire TV” peut casser Turnstile, providers ou rendu mobile.
5. **Back** : intercepter globalement le bouton sans hiérarchie peut empêcher historique WebView/settings/PiP.
6. **Manifest** : rendre leanback/touchscreen obligatoires pourrait exclure les téléphones.
7. **Package/signature** : même applicationId + signature de test peut entrer en conflit avec l'APK upstream.
8. **Updater** : une build TV de test peut tenter de revenir vers le manifest `main`.
9. **Players tiers** : tentative de manipulation DOM cross-origin impossible/fragile.
10. **Source distante** : modifier le frontend Movix pour un besoin uniquement APK TV augmenterait inutilement le blast radius.

## 15. Emplacements recommandés pour l'implémentation TV

Ordre recommandé :

1. manifest Android pour la présence launcher TV ;
2. helper/runtime natif ou RN dédié fournissant une source de vérité `isTV` ;
3. propagation explicite vers `BrowserScreen` / `WebViewBrowser` ;
4. extension TV-only de `buildInjectedJavaScript` ou bootstrap voisin ;
5. classe/flag DOM TV (`movix-tv`, `window.MOVIX_TV`) ;
6. future couche TV isolée dans un module JS/CSS dédié ;
7. seulement ensuite : corrections ciblées frontend/player lorsque l'injection ne suffit pas.

## 16. Fichiers probablement modifiés plus tard

Fondations :

- `app/android/app/src/main/AndroidManifest.xml`
- `app/android/app/src/main/java/com/movix/app/MainActivity.kt` et/ou module natif TV dédié
- `app/android/app/src/main/java/com/movix/app/MainApplication.kt` si package natif dédié
- `app/src/screens/BrowserScreen.tsx`
- `app/src/components/WebViewBrowser.tsx`
- `app/src/injection/inject.ts`
- nouveau module TV dédié sous `app/src/`
- ressources Android TV (banner si validée)

Navigation/player ultérieurs :

- `Header.tsx`
- `EmblaCarousel.tsx`
- `SearchCard.tsx`
- `ContentRow.tsx`
- pages détails/recherche/profil
- `HLSPlayer.tsx`
- `LiveTVPlayer.tsx`
- `FranceTVPlayer.tsx`
- `playerControlInteraction.ts`.

## 17. Fichiers qu'il vaut mieux ne PAS modifier pour les fondations

Sauf bug concret démontré :

- le userscript métier `userscript/movix.user.js` ;
- la logique d'extraction/providers ;
- DNS/VPN ;
- media proxy ;
- Cast internals ;
- PiP internals ;
- updater natif ;
- API backend ;
- frontend distant global pour une simple détection TV ;
- configuration mobile/iOS sans nécessité.

## 18. Conclusion checkpoint A

La base technique permet une variante TV propre sans fork massif du frontend :

**détection native/RN explicite → WebViewBrowser → bootstrap TV-only → future navigation spatiale.**

Le principal risque n'est pas la présence Android TV dans le launcher ; il est l'interaction entre navigation D-pad et handlers clavier desktop/player déjà existants. Ce conflit doit être cartographié avant toute interception globale des flèches.
