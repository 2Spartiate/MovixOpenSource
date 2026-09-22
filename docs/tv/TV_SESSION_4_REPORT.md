# MOVIX Google TV — Session 4 report

## Identité

- Dépôt : `2Spartiate/MovixOpenSource`
- Branche : `agent/google-tv-roadmap-v1`
- Base de reprise après résolution DNS : `8a5caea88ec3af938296cec7bfec5e040937561a`
- HEAD produit validé par CI : `aa4138e62a0a00a147c6fa143e98c0830c921dea`
- Workflow : `Android TV foundations`
- Run : `35778285837`
- Conclusion CI : **SUCCESS**
- Artefact : `movix-google-tv-standalone-apk`
- SHA-256 APK extrait : `9d20583d7ee1864989044a4070678ea4b34967f30303dff0361f20e74e8b93ab`
- Taille APK : 72 547 690 octets
- Validation matérielle Google TV : **À EFFECTUER**

## Objectif

Reprendre la roadmap Google TV après la résolution du bug DNS, réactiver les fonctions TV volontairement neutralisées pendant l'investigation et appliquer un lot UI/navigation avant une nouvelle compilation coûteuse.

## Résultat

Les demandes de la session sont implémentées :

1. icône Telegram du header supprimée ;
2. marque MOVIX conservée mais non cliquable ;
3. barre d'adresse et barre de navigation native basse supprimées ;
4. promotion « Rejoignez notre communauté » supprimée ;
5. footer supprimé ;
6. D-pad spatial réactivé sur Google TV et Lenis désactivé sur TV ;
7. flèches de carrousels supprimées, déplacement par focus + scroll Embla ;
8. étape intermédiaire « Merci pour ton aide / Lecture » supprimée après le clic pub du player.

Le comportement téléphone reste distinct pour la navigation TV : le bootstrap `MOVIX_TV` et le runtime D-pad ne sont activés que lorsque le shell natif détecte Android TV. Le téléphone conserve le comportement tactile/web normal.

## Commits de la session

| Commit | Objet |
|---|---|
| `f84a42d` | Suppression Telegram header + logo MOVIX non navigable |
| `f963866` | Suppression footer + promotion Telegram |
| `3d5a307` | Suppression barres adresse/navigation du shell |
| `a536b8e` | Carrousels sans flèches, focus-driven |
| `5e0cc47` | Restauration bootstrap TV + D-pad après isolation DNS |
| `b1e8fe6` | Suppression étape « Merci / Lecture » après pub player |
| `aa4138e` | Mise à jour et extension des contrats/tests TV |

## D-pad / scroll

Le runtime TV :

- découvre les focusables au moment de chaque touche ;
- traite Left/Right/Up/Down par navigation spatiale ;
- centre les cartes d'un carrousel lors du déplacement horizontal ;
- consomme les flèches éligibles même au bord du graphe afin d'empêcher Chromium de retomber sur un scroll de page ;
- laisse les inputs, sliders et contrôles player explicitement natifs consommer leurs propres flèches ;
- restaure le dernier focus après les mutations SPA.

`SmoothScroll` ne démarre plus Lenis lorsque `window.MOVIX_TV === true`.

## Carrousels

Les flèches UI ont été retirées de :

- `EmblaCarousel` ;
- `ContentRow` ;
- `EmblaCarouselGenres` ;
- `EmblaCarouselPlatforms`.

Sur TV, les cartes portent les marqueurs de focus et le focus appelle `emblaApi.scrollTo(index)`. Sur téléphone, les carrousels restent manipulables au tactile.

## Shell natif

`BrowserScreen` ne rend plus :

- `BrowserToolbar` ;
- `IOSBrowserToolbar` ;
- barre URL ;
- barre Back / Forward / Reload / Home / Settings.

Le WebView occupe l'espace disponible. Le mini accès paramètres reste téléphone-only et n'entre pas dans l'UI TV.

Le chemin Back TV spécifique est restauré : les players peuvent consommer `movix-tv-back` avant le retour d'historique.

## Publicité player

Pour la variante `player` de `AdFreePlayerAds`, le clic publicitaire appelle maintenant directement `finalOnAccept()` après le geste pub. Le rendu `hasClicked` avec « Merci pour ton aide » puis bouton « Lecture » n'est donc plus affiché.

Les variantes téléchargement et Live TV conservent leur état de déverrouillage spécifique.

## DNS — invariant préservé

La restauration du runtime TV n'a pas modifié le correctif DNS J3C :

- première installation : attente de la décision utilisateur / permission VPN avant montage de l'AddressProvider ;
- relances avec DNS déjà activé : chemin fire-and-forget conservé ;
- récupération automatique J3B : refresh resolver + remount WebView en one-shot conservés ;
- architecture DNS virtuelle `10.215.173.2` et pool de 8 workers conservés.

Un contrat CI dédié vérifie simultanément ces invariants DNS et la restauration du runtime TV.

## Validation CI

Run `35778285837` : **SUCCESS**.

Étapes validées :

- installation dépendances frontend/app ;
- rebuild userscript ;
- contrats TV complets + contrats DNS + nettoyage UI + nettoyage artefacts ;
- TypeScript `npx tsc --noEmit` ;
- build frontend production ;
- build Android standalone release ;
- manifest TV + mobile ;
- présence du bundle JS standalone ;
- purge des anciens artefacts Android ciblés ;
- upload de l'APK.

## Prochaine étape

Smoke-test matériel Google TV sur l'APK du HEAD `aa4138e`, en priorité :

1. Home : focus initial et navigation verticale entre rangées ;
2. carrousels : Left/Right carte par carte, auto-scroll, aucune flèche ;
3. header : logo non focusable, Telegram absent, recherche focusable ;
4. aucun footer / promotion Telegram ;
5. aucun chrome navigateur bas ;
6. lancement film : comportement pub attendu et absence du deuxième écran « Merci / Lecture » ;
7. players HLS / LiveTV / FranceTV : D-pad, menus, sliders, fullscreen et Back ;
8. téléphone : chargement, tactile, lecture et absence de régression majeure.
