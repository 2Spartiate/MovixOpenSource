# Movix Google TV — architecture v1

Checkpoint C — décision architecturale après les audits A+B.

Référence : `agent/google-tv-roadmap-v1@d9590e8dec5abcf6ef83bff40bbdb0f6c8f8c6cd`.

## 1. Source de vérité pour la détection TV

Movix utilise React Native `0.75.4`.

La documentation React Native 0.75 expose explicitement :

- `Platform.isTV: boolean` ;
- `Platform.constants.uiMode` sur Android avec notamment la valeur `'tv'`.

Android définit de son côté `Configuration.UI_MODE_TYPE_TELEVISION`.

**Décision :** utiliser une abstraction Movix dédiée basée sur :

`Platform.OS === 'android' && Platform.isTV === true`

Cette API RN est elle-même alimentée par l'information native Android de mode UI ; elle n'est donc ni une heuristique de résolution ni une détection user-agent.

Nous ne créons pas de module Kotlin `UiModeManager` redondant tant que cette source RN 0.75 répond correctement sur les appareils cibles.

### Fallback

- Android téléphone/tablette : `false`.
- Android TV / Google TV correctement déclaré par le système : `true`.
- iOS : `false` pour cette variante Android TV, même si React Native peut exposer `Platform.isTV` sur d'autres plateformes.
- Aucun fallback par largeur d'écran.
- Aucun fallback par user-agent.
- Si un boîtier Android non certifié se déclare incorrectement en `uiMode=normal`, il sera traité comme téléphone jusqu'à preuve qu'un override diagnostique est nécessaire. Ce cas ne doit pas justifier une heuristique globale.

## 2. Transmission du signal vers la WebView

Flux autoritaire :

`Android Configuration / React Native Platform.isTV`
→ helper `isAndroidTvRuntime()`
→ `BrowserScreen`
→ prop explicite vers `WebViewBrowser`
→ `buildInjectedJavaScript({ tvMode: true })`
→ bootstrap TV-only dans la frame principale.

Le contenu web reçoit deux marqueurs stables :

- `window.MOVIX_TV = true`
- classe `movix-tv` sur `document.documentElement`.

Sur téléphone, aucun de ces marqueurs n'est posé par l'application.

## 3. Où vit la future logique TV

Séparation prévue :

### Couche native / React Native

Sous `app/` :

- détection runtime TV ;
- visibilité launcher TV ;
- propagation `isTV` ;
- gestion hiérarchique Android Back quand une information native est nécessaire ;
- future intégration éventuelle de touches Android très spécifiques si la WebView ne les transmet pas correctement.

### Couche injectée TV

Sous `app/src/injection/` :

- bootstrap TV ;
- futur moteur spatial ;
- découverte des éléments focusables ;
- `MutationObserver` ;
- style focus TV ;
- adaptation TV-only de certains éléments de page ;
- coordination scroll/focus.

### Frontend Movix partagé

Sous `src/` uniquement lorsque l'injection ne peut pas garantir un comportement robuste, par exemple :

- empêcher les handlers player Arrow* d'intercepter un contrôle focusé ;
- faire rester visibles les contrôles player sous focus ;
- restaurer proprement le focus après menus complexes ;
- ajouter une sémantique manquante à un composant.

**Règle :** ne pas modifier le frontend distant global pour une simple détection ou un simple style TV réalisable dans l'APK.

## 4. Isolation téléphone / web

Le mode TV est un opt-in runtime explicite.

Invariants :

- `isTV=false` → injection historique inchangée ;
- aucun CSS TV global sur desktop/mobile ;
- aucun changement de user-agent pour simuler une TV ;
- aucun branchement par taille d'écran ;
- les raccourcis clavier desktop restent actifs hors TV ;
- le userscript métier actuel reste indépendant de la navigation TV.

Les adaptations frontend éventuellement nécessaires devront être conditionnées par le marqueur TV ou conçues comme corrections génériques non régressives.

## 5. Responsabilités native Android

Relèvent du natif / manifest :

- launcher `LEANBACK_LAUNCHER` ;
- features leanback/touchscreen ;
- bannière TV ;
- information native de type d'appareil exposée via React Native ;
- réception du bouton Back côté application ;
- package/signature ;
- installation/updater ;
- PiP/Cast/services existants.

Ne relèvent **pas** du natif :

- calcul géométrique du voisin focusable dans le DOM ;
- détection des rangées de posters ;
- menus HTML internes ;
- `scrollIntoView` du site ;
- MutationObserver du DOM web.

## 6. Responsabilités React Native

`BrowserScreen` est le point d'orchestration :

- connaît `isTV` ;
- transmet `isTV` à la WebView ;
- conserve le comportement toolbar/settings existant ;
- reste le propriétaire de l'Android Back natif.

`WebViewBrowser` :

- reçoit le booléen ;
- construit le script approprié ;
- n'injecte le bootstrap TV que si `isTV=true` ;
- garde les iframes sans injection grâce à `injectedJavaScriptBeforeContentLoadedForMainFrameOnly`.

## 7. Responsabilités JS injecté

La couche injectée TV doit être :

- idempotente ;
- isolée par un namespace `MOVIX_TV` / classes `movix-tv*` ;
- réinstallée proprement à chaque nouveau document WebView ;
- capable de tolérer les rerenders React SPA ;
- incapable de modifier le comportement si le marqueur TV n'existe pas.

La session 1 ne crée que le bootstrap ; le moteur spatial complet appartient à la phase suivante.

## 8. Quand modifier le frontend Movix

Modification du frontend seulement si au moins une des conditions est vraie :

1. la logique est interne à un composant et l'injection ne peut pas l'intercepter proprement ;
2. un handler React consomme la touche avant qu'une couche générique puisse agir ;
3. un contrôle n'a aucune sémantique DOM stable exploitable ;
4. l'auto-hide d'un player doit connaître son propre état React ;
5. une restauration de focus doit être couplée à l'ouverture/fermeture d'un panneau React.

Exemples déjà identifiés :

- `HLSPlayer` : garde interactive du handler Arrow* ;
- `LiveTVPlayer` / `FranceTVPlayer` : même problème ;
- controls player visibles sous focus.

## 9. Stratégie MutationObserver

Le futur moteur spatial utilisera un unique observer TV scoped au document principal.

Il surveillera au minimum :

- ajout/retrait de nœuds ;
- attributs pertinents à la focusabilité si nécessaire ;
- apparition/disparition de menus/modals/rangées.

Il ne recalculera pas en permanence toute la page.

Stratégie :

1. invalider un cache léger de candidats ;
2. regrouper les mutations dans une microtask / frame ;
3. recalculer à la prochaine interaction D-pad ou au prochain frame utile ;
4. déconnecter l'observer au remplacement du document.

Éviter un observer par carte/composant.

## 10. Stratégie focus

Le moteur futur partira des éléments réellement interactifs/visibles :

- `button`, `a[href]`, `input`, `select`, `textarea` ;
- `[role=button]`, `[role=slider]` ;
- `[tabindex]` non négatif ;
- cibles TV explicitement annotées.

Exclusions :

- disabled ;
- `tabIndex < 0` sauf cible explicitement gérée ;
- `display:none` / `visibility:hidden` ;
- rectangles nuls ;
- descendants d'une couche inactive ;
- overlays décoratifs ;
- actions secondaires explicitement retirées du parcours TV.

Sélection spatiale :

- demi-plan correspondant à la direction ;
- priorité à l'alignement dans le même couloir ;
- distance principale avant distance secondaire ;
- stabilité de rangée ;
- éviter les sauts vers le header lors d'un Down local.

## 11. Stratégie scrollIntoView

Le scroll n'est jamais l'action primaire d'une flèche TV.

Après choix du prochain focus :

1. `element.focus({ preventScroll: true })` si supporté ;
2. `scrollIntoView` uniquement si nécessaire ;
3. préférence `block: 'nearest'`, `inline: 'nearest'` ;
4. centrer une rangée/carte seulement lorsque nearest laisse la cible mal cadrée.

Pour un carrousel géré par Embla, une adaptation ciblée peut être préférable à un scroll DOM générique si le conteneur masque les cartes.

## 12. Restauration du focus

Un registre léger mémorisera :

- trigger d'un menu/modal ;
- dernier poster focusé par rangée lorsque pertinent ;
- élément ayant lancé un player ;
- dernière cible avant navigation de sous-page lorsque récupérable.

À la fermeture :

1. vérifier que l'ancien trigger est encore connecté et visible ;
2. le refocus ;
3. sinon utiliser une cible de secours locale ;
4. ne jamais tomber arbitrairement sur `document.body` puis le header si une cible contextuelle existe.

## 13. Stratégie player

Principe : distinguer **navigation des contrôles** et **raccourcis vidéo**.

Sur TV :

- si un contrôle player est focusé, Arrow* sert d'abord au graphe de focus / au contrôle natif ;
- `input[type=range]` conserve sa sémantique lorsque focusé ;
- seek/volume globaux ne doivent pas intercepter un contrôle focusé ;
- controls visibles tant que `:focus-within` ou état React équivalent ;
- ouverture settings/sources mémorise le trigger ;
- fermeture Back/Escape restaure le trigger.

Hors TV :

- conserver les raccourcis desktop existants.

La fonction `isPlayerControlInteractionTarget` est un bon point de convergence, mais les trois players ne l'utilisent pas encore de manière homogène dans leurs handlers clavier.

## 14. Stratégie iframe cross-origin

Une iframe cross-origin est une frontière de contrôle.

Le parent Movix peut :

- rendre l'iframe elle-même focusable ;
- laisser la télécommande entrer dans l'iframe si le navigateur/provider le permet ;
- garder des contrôles parent (Back/Sources) accessibles ;
- choisir/prioriser une source interne quand l'UX l'autorise.

Le parent ne peut pas :

- inspecter arbitrairement le DOM interne ;
- reconstruire les boutons internes ;
- garantir que le provider gère le D-pad.

Chaque provider tiers devra être smoke-testé. L'absence de contrôle interne est une limitation déclarée, pas un bug à masquer par un hack cross-origin.

## 15. Stratégie Android Back

Hiérarchie cible :

1. menu/modal TV injecté actif ;
2. panneau secondaire player actif ;
3. plein écran ;
4. player → fiche ;
5. historique SPA/WebView ;
6. settings RN ;
7. sortie application à la racine.

La hiérarchie exacte devra respecter les propriétaires d'état :

- le DOM ferme ce qu'il possède ;
- React Native ferme ses propres settings ;
- Android n'essaie pas de deviner l'état d'un menu web opaque.

Un petit contrat JS↔RN pourra être ajouté plus tard si le DOM doit signaler qu'il a consommé Back. Ce contrat n'est pas nécessaire au bootstrap de session 1.

## 16. Recherche vocale via IME

Décision v1 :

- conserver le vrai `input` du header ;
- laisser Android/Google TV ouvrir son IME ;
- profiter de la dictée du clavier système si disponible ;
- ne pas demander `RECORD_AUDIO` uniquement pour la recherche ;
- ne pas implémenter un bouton micro natif avant preuve d'un bénéfice.

## 17. Package et signature des APK de test

Session 1 conserve :

- namespace `com.movix.app` ;
- applicationId `com.movix.app` ;
- signature debug pour les builds debug sans keystore release.

Conséquence : une APK debug signée différemment ne pourra pas nécessairement être installée par-dessus une installation `com.movix.app` signée upstream.

Pour un premier smoke-test, options opérationnelles :

- désinstaller l'app upstream avant d'installer la debug ;
- ou, dans une phase dédiée ultérieure, créer une variante `applicationIdSuffix` / package TV séparé.

**Ne pas changer l'applicationId dans cette session** : cela affecterait updater, deep links, FileProvider, coexistence et tests Cast.

Avant distribution régulière, la variante séparée `com.movix.app.tv` est à réévaluer avec :

- updater désactivé/redirigé ;
- deep links ;
- FileProvider ;
- Cast ;
- migration éventuelle des données.

## 18. Updater

Une build de branche avec le même package conserve aujourd'hui l'updater historique, qui lit le manifest de la branche `main` du GitHub configuré.

Le bootstrap TV ne doit pas toucher l'updater.

Avant diffusion de builds TV de test à long terme, il faudra choisir explicitement :

- updater désactivé sur variante TV ;
- channel TV dédié ;
- ou package séparé.

## 19. Contrat de session 1

À la fin des fondations :

- launcher TV déclaré ;
- détection `isTV` explicite ;
- BrowserScreen connaît ce booléen ;
- bootstrap WebView pose seulement le mode TV + style focus minimal ;
- aucun moteur spatial complet ;
- aucun nettoyage massif header/carrousel/player ;
- téléphone/web restent sur le chemin historique.

## 20. Décision finale

Architecture retenue :

**Android UI mode → React Native `Platform.isTV` → helper Movix → BrowserScreen → WebViewBrowser → bootstrap TV-only → future couche spatiale.**

Cette architecture réutilise la source de vérité native déjà fournie par React Native 0.75, limite le blast radius, et garde les adaptations DOM dans l'APK tant qu'une modification du frontend n'est pas techniquement nécessaire.
