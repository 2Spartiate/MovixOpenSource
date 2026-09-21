# Movix Google TV — Session 2 spatial navigation

## Références

- Dépôt : `2Spartiate/MovixOpenSource`
- Branche : `agent/google-tv-roadmap-v1`
- Base historique : `main@ff56b3c57511c84cedc89956ba05dedba7630f1d`
- HEAD au début de la Session 2 : `96b88865954ddf1dd3b8ef109d675c90fe586821`
- HEAD de code validé avant le rapport Q : `c8b93dffb9c8f162d1e60cf0317da31f848e2da3`
- HEAD final : commit contenant ce rapport. Le SHA exact ne peut pas être auto-référencé dans son propre objet Git ; il est à lire dans l'historique de branche / compte-rendu final.
- Upstream `movixcorp/MovixOpenSource` : lecture seule.
- `main` n'a pas été modifiée.

## Checkpoints G → Q

| Checkpoint | Statut | Commit(s) | Résumé |
|---|---|---|---|
| G | PASS | `c287ec9e1e9a8097ca6ca818136391eb122d9590` | Clôture et gel documentaires de la Session 1 après confirmation de la CI 35641303926. |
| H | PASS | `5cb34085446481c0b4102d0540850b9dc5450cd0`, `87fdf83515e1da16e75481a42e67671537dbee58` | Moteur spatial pur, DOM/React-free, scoring directionnel déterministe + 12 tests. |
| I | PASS | `221951178241a7a65e046a2dd269b0cc8954bdbe`, `9a232904d004b736f8d0c0da70dd60787727cbc6` | Découverte lazy des éléments focusables, règles d'inclusion/exclusion et marqueurs TV stables. |
| J | PASS | `739d1c2d5ff76f9d76468a777e6d8a8f1df429d6`, `b08601b8dfdb14efe5b2dc77db4b4600537008da`, `d7eb562273d0edee400f9fa2236438a1007a753a` | Branchement D-pad TV-only ; les flèches ne sont consommées qu'après un déplacement réussi. |
| K | PASS | `dfc02d1688870abfea8c1830bbffd25108c5ae3f`, `9ba120719c316b9fc7b50c992b982cbb6a627af4` | Runtime idempotent, listener remplaçable, découverte dynamique à la demande sans cache de candidats. |
| L | PASS | `43208f79842ee1b5d9bcfeaaf6ecba2ac207c93a`, `1461a717d78b2e26c1b6faf345b8d70b9453f9d4`, `819e4bfd9c318856326f510924f89068d227028b` | Logo/Telegram hors focus TV, recherche primaire, compte transformé en vrai bouton focusable. |
| M | PASS | `3a5047bee1462bc373ab9f684a3cc62b55dad5ee`, `4c3c06051e2320c18d706c39fb303c4f96ec1cd7`, `9021470922691ca2f53b2a4c90a8e75a0d16a02e`, `40048444cdd670886a59d81caa74d9874fe8b4bb`, `65b6e6810089dd6a44c7e96d0e1b1c7d8a6dd3dc` | Une carte = cible principale ; flèches/overlays favoris exclus et masqués uniquement en mode TV. |
| N | PASS | `0ea88fc0461855b95f3a84711fce41443b0d54b6`, `7af2cb988c70495f93b2322df1db70015a0fe8ac`, `fb12e4a8017741e1a074125761914a95fc85d60e` | Focus pilotant le scroll : Embla `scrollTo(index)`, centrage horizontal des cibles de rangée. |
| O | PASS | `39a98f7efa525bd06e7b46b5450e1d9a6bfbb545`, `bb04ed014c0625d7c39e4b803ebc8f725f404997`, correctif `60483b13bc8102eadf1f0b310ebbd7a806a7cf46` | Focus initial + mémoire légère/restauration SPA ; observer limité à la récupération après perte de focus. |
| P | PASS | `d047e2ac95c548f4e6df9d9190321d2f48ae125b`, `4ab477e9544b01caecac6f77094009b61d67d083`, `e3288c96f022d2436c79e74f4b97bf4f6f334fd9`, `5f0871eb6b3dca15fb64ade71a213e9e85c16108`, `17eb2bb143455e0b8b99df2c3e27a3c6ba93b744`, `c8b93dffb9c8f162d1e60cf0317da31f848e2da3` | Matrice CI élargie, corrections de contrats détectées par CI, build frontend + Android final PASS. |
| Q | PASS | commit contenant ce rapport | Clôture documentaire de la Session 2. |

## Architecture finale du moteur spatial

Le moteur est séparé en trois couches :

1. `tv-spatial-engine.ts` : algorithme pur sur rectangles, sans DOM ni React ;
2. `tv-focus-dom.ts` : adaptation du DOM courant vers les candidats ;
3. `tv-dpad-runtime.ts` : politique clavier, focus, scroll, idempotence et restauration.

Le scoring du moteur :

- rejette les cibles derrière le demi-plan demandé ;
- donne la priorité à la distance sur l'axe principal ;
- pénalise fortement la dérive perpendiculaire ;
- favorise le chevauchement du corridor visuel ;
- pénalise les diagonales excessives ;
- utilise des départages géométriques puis l'ordre source pour un résultat déterministe.

La liste de candidats n'est pas mise en cache : elle est redécouverte à chaque déplacement. Cela rend immédiatement visibles les cartes lazy-loaded, résultats de recherche, modals et changements SPA.

## Règles d'exclusion / compatibilité

Sont exclus du graphe TV notamment :

- `disabled` ;
- `aria-disabled=true` ;
- `tabindex=-1` ;
- `hidden`, `aria-hidden`, `display:none`, `visibility:hidden/collapse` ;
- dimensions nulles ;
- éléments déconnectés ;
- descendants de `[data-tv-ignore-focus]` ou `[inert]`.

Le handler D-pad ne détourne pas les flèches dans :

- input d'édition / range et autres inputs non bouton ;
- textarea ;
- select natif ;
- contenteditable ;
- `role=slider` ;
- `[data-tv-consume-arrows]` ;
- `[data-tv-player-control]` ;
- `[data-tv-dpad-scope="native"]`.

`preventDefault()` n'est appelé qu'après qu'une cible a réellement accepté le focus.

## Header TV

- logo MOVIX : visible, mais `data-tv-ignore-focus` ;
- Telegram : conservé pour desktop/mobile, ignoré par le graphe TV ;
- recherche : vrai `input`, marqué `data-tv-primary-focus="search"` ;
- compte : ancien `motion.div` cliquable remplacé par un `motion.button` sémantique, marqué `data-tv-primary-focus="account"`, avec `aria-haspopup` / `aria-expanded`.

Aucune permission `RECORD_AUDIO` n'a été ajoutée : l'IME/clavier Google TV reste responsable de la dictée éventuelle.

## Carrousels

- les liens cartes/posters sont `data-tv-focus data-tv-card` ;
- les rangées portent `data-tv-focus-group="carousel-row"` / `data-tv-carousel-row` ;
- flèches de carrousel et overlays favoris sont `data-tv-ignore-focus` ;
- en mode `.movix-tv`, flèches et étoiles overlays sont masquées ;
- leur comportement souris/tactile desktop/mobile est conservé ;
- sur Embla, le focus d'une carte déclenche `emblaApi.scrollTo(index)` ;
- le runtime spatial centre horizontalement les cartes d'une rangée et utilise `nearest` hors rangée ;
- UP/DOWN restent gouvernés par le moteur géométrique pour conserver au mieux la colonne visuelle.

## Focus initial et restauration

Priorité :

1. `data-tv-autofocus` ;
2. `data-tv-primary-focus` ;
3. première `data-tv-card` ;
4. premier élément focusable.

Le runtime ne remplace pas un focus existant et laisse un dialog explicitement autofocusé gérer son propre focus.

La mémoire légère utilise, selon disponibilité :

- `data-tv-focus-id` ;
- `id` ;
- `data-tv-primary-focus` ;
- `href`.

Un `MutationObserver` existe uniquement pour détecter une occasion de restauration lorsque le focus est vide. Il ne maintient aucun cache de candidats et est gardé par `requestAnimationFrame`, déconnecté lors d'une réinjection/destruction.

## Tests et CI

Workflow final : **Android TV foundations**  
Run final : **35644410241**  
HEAD testé : `c8b93dffb9c8f162d1e60cf0317da31f848e2da3`  
Conclusion : **success**.

Validation finale :

- installation frontend : PASS ;
- installation app shell : PASS ;
- rebuild userscript : PASS ;
- suites TV H→O : **49 tests, 49 PASS, 0 FAIL** ;
- `npx tsc --noEmit` : PASS ;
- `npm run build` frontend : PASS avec origine de build non déployée `https://movix.example` ;
- `:app:processDebugMainManifest` : PASS ;
- `:app:assembleDebug` : PASS ;
- Gradle : **BUILD SUCCESSFUL** ;
- assertions merged manifest TV + mobile : PASS ;
- post-jobs GitHub : PASS.

Corrections trouvées pendant P :

- source runtime O : quatre template literals imbriqués rendaient `tv-dpad-runtime.ts` invalide pour TypeScript ; corrigé en concaténation simple ;
- deux tests de contrats frontend utilisaient un mauvais chemin de fixture ;
- un test K interdisait encore tout `MutationObserver`, alors que O en ajoute un uniquement pour restaurer un focus perdu ;
- un test J attendait encore `inline: 'nearest'` alors que N centre volontairement les cartes de carrousel ;
- le build Vite exige `VITE_SITE_URL` ; la CI fournit désormais une origine de validation non déployée.

Warnings non bloquants observés :

- avertissements de dépréciation npm / dépendances React Native ;
- avertissement GitHub Actions concernant le passage des actions Node 20 vers Node 24 ;
- warning Tailwind sur une classe `ease-[cubic-bezier(...)]` existante ;
- warning de taille de chunk Vite ;
- warnings Android/Jetifier et APIs dépréciées de dépendances existantes.

Aucun de ces warnings n'a fait échouer le run final.

## Différences desktop / mobile / TV

### TV

- moteur spatial actif ;
- focus initial/restauration actifs ;
- flèches et overlays favoris des carrousels masqués ;
- logo/Telegram ignorés ;
- cartes structurées comme cibles principales ;
- scroll suit le focus.

### Desktop / mobile

- aucun moteur spatial injecté ;
- CSS `.movix-tv` non actif ;
- flèches carrousel et favoris restent disponibles ;
- logo et Telegram conservent leurs comportements ;
- recherche inchangée ;
- le déclencheur compte devient un vrai bouton sémantique, sans changer son action.

## Limites connues

Cette session ne valide pas :

- comportement sur Google TV physique ;
- latence/perception réelle du focus sur télécommande ;
- players HLS/LiveTV/FranceTV au D-pad ;
- menus settings/subtitles/quality player ;
- iframe cross-origin ;
- historique complexe de restauration dans un player ;
- packaging TV final ;
- bannière marketing finale.

Aucun APK n'a été publié. `assembleDebug` a uniquement servi de validation CI.

## Prochaine étape précise

**SESSION 3 — intégration D-pad des players et isolation de leurs contrôles**, en commençant par inventorier/poser les scopes `data-tv-player-control` / `data-tv-dpad-scope="native"`, puis adapter progressivement HLSPlayer, LiveTVPlayer et FranceTVPlayer sans laisser le moteur global voler leurs flèches.
