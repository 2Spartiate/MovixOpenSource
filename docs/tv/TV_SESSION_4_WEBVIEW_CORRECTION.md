# MOVIX Google TV — Correction post-smoke-test WebView

## Constat matériel

L'APK issue du HEAD `aa4138e` a été testée par l'utilisateur.

Résultat réel :

- barres d'adresse/navigation natives : supprimées correctement ;
- icône Telegram web : toujours visible ;
- flèches des carrousels web : toujours visibles ;
- promotion Telegram web : toujours visible ;
- popup/new-window : régression, les popups ressortaient ;
- écran « Merci pour ton aide / Lecture » : toujours présent ;
- D-pad : pas de navigation spatiale effective, comportement ressenti = scroll de page par petits pas.

## Cause racine

Le shell React Native ne rend pas le frontend `../src/**` local dans le WebView.

`WebViewBrowser` charge une URL distante via :

`source={{ uri: url }}`

Conséquence fondamentale :

**modifier le frontend web `src/**` dans ce dépôt ne change pas le DOM du site déjà déployé chargé par l'APK.**

C'est pourquoi les seules modifications visibles du premier lot étaient celles du shell natif (`BrowserScreen`) : suppression des barres d'adresse/navigation.

Les suppressions Telegram/footer/flèches et la logique post-pub avaient été faites principalement dans le frontend local non déployé ; elles ne pouvaient donc pas apparaître dans l'APK qui charge le site distant.

Cette règle doit être conservée pour toutes les sessions suivantes :

- comportement app-only sur le DOM Movix distant -> `app/src/injection/**` ;
- chrome natif -> `app/src/**` React Native ;
- changement `src/**` web -> visible dans l'APK seulement après déploiement du frontend distant.

## Régression popup

Pendant la reprise post-DNS, `WebViewBrowser` avait retrouvé le comportement baseline qui envoyait les nouvelles fenêtres externes vers le navigateur système avec `Linking.openURL`.

La protection historique a été restaurée à deux niveaux :

1. `window.open` remplacé avant les scripts du site ;
2. `onOpenWindow` natif ignore les nouvelles fenêtres ;
3. `javaScriptCanOpenWindowsAutomatically={false}`.

## Correctif app-only du site distant

Nouveau runtime :

`app/src/injection/app-site-overrides.ts`

Il est injecté dans tous les WebViews de l'app, avant les scripts du site, puis réappliqué via `MutationObserver` pour survivre aux rendus React/SPA.

Il agit directement sur le DOM réellement chargé et :

- retire les liens Telegram `t.me/movix_site` du header ;
- retire la promotion Telegram ;
- rend la marque MOVIX du header inerte et hors focus ;
- retire les `footer` ;
- retire les boutons de flèches de carrousel ;
- détecte les cartes poster du site distant et ajoute les marqueurs TV nécessaires ;
- marque les rangées comme carrousels TV ;
- sur TV, détruit `window.lenis` pour empêcher le smooth-scroll web de concurrencer le D-pad ;
- détecte l'état post-pub « Merci pour ton aide » et active automatiquement le bouton « Lecture ».

## Détection TV renforcée

Le shell utilisait uniquement `Platform.isTV`.

Le runtime accepte désormais aussi le signal natif Android :

`Platform.constants.uiMode === 'tv'`

Aucune heuristique de taille d'écran ou User-Agent n'est utilisée.

## Validation

HEAD produit corrigé :

`40b505ee97580a63df7c773dc17338cfc0551512`

Workflow :

`Android TV foundations`

Run :

`35781337047`

Résultat :

**SUCCESS**

Le workflow a validé :

- rebuild userscript ;
- contrats TV / D-pad / DOM distant / popup ;
- TypeScript ;
- build frontend ;
- build Android standalone release ;
- manifest TV + mobile ;
- bundle JS embarqué ;
- artefact APK.

APK :

- fichier : `app-release.apk`
- taille : `72 549 786` octets
- SHA-256 : `ea06c53d22646a7654e02a2bc228cd4bccd78d8ccde331f481cfa3532e1b65df`

## Smoke-test suivant

Vérifier sur le même matériel :

1. Telegram header absent ;
2. promotion Telegram absente ;
3. footer absent ;
4. flèches carrousel absentes ;
5. logo MOVIX non cliquable ;
6. aucun popup externe ;
7. après « Voir une publicité », pas d'écran intermédiaire « Merci / Lecture » ;
8. D-pad déplace le focus de cible en cible, sans scroll de page par petits pas ;
9. Left/Right fait défiler les carrousels par focus ;
10. téléphone conserve navigation tactile et lecture.
