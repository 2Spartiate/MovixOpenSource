# Movix Google TV — audit du gate publicitaire avant lecture

## Portée

Cet audit décrit le code au HEAD `af35146106d988d42759738e3f6cacad82b3d0d4` de `agent/google-tv-roadmap-v1`.

Il faut distinguer deux familles qui ne doivent pas être confondues :

- **A — gates publicitaires pilotés par Movix** : logique React qui bloque ou retarde explicitement le lancement d'une lecture et ouvre une publicité ou attend un état d'unlock ;
- **B — publicités des lecteurs / embeds tiers** : contenu servi à l'intérieur d'un lecteur externe, dont le DOM et le comportement ne sont pas nécessairement contrôlables par Movix.

Le runtime Google TV est déjà exposé au frontend par le shell Android via `window.MOVIX_TV = true` et la classe racine `.movix-tv`. Le shell Android ne contient pas de gate publicitaire propre : il charge le frontend dans la WebView et injecte le contrat TV.

## A. Gate Movix général — films, séries, anime et lecteurs internes/embeds

### Déclencheur

`src/context/AdFreePopupContext.tsx` fournit `showPopupForPlayer()`.

Hors VIP, cette fonction considère actuellement tous les types de player comme soumis au popup, pose `showAdFreePopup=true` et, sauf mode `click-anywhere`, met `shouldLoadIframe=false`.

Les pages `WatchMovie.tsx` et `WatchTv.tsx` déclenchent `showPopupForPlayer()` une fois une source choisie et les chargements nécessaires terminés. Elles posent ensuite `adPopupTriggered=true`.

`WatchAnime.tsx` déclenche également `showPopupForPlayer()` lors de l'acceptation de la source.

### Condition d'autorisation

La voie normale passe par `AdFreePlayerAds.tsx`.

Dans le contexte générique, `handlePopupAccept()` :

- ferme le popup ;
- met l'état React `is_vip=true` **en mémoire seulement** ;
- met `shouldLoadIframe=true` ;
- émet l'événement `ad_popup_accepted`.

Ce pseudo-VIP de session n'est pas écrit dans `localStorage`. Un changement de route réinitialise l'état temporaire et relit le vrai statut VIP depuis sa source de vérité.

Dans `WatchMovie.tsx` / `WatchTv.tsx`, fermer le popup sans avoir débloqué la lecture peut poser `adPopupBypass=true`, ce qui affiche un écran bloquant demandant de regarder la publicité. Le HLS player n'est rendu que lorsque la condition `!adPopupTriggered || shouldLoadIframe || hasClickedAd` est satisfaite.

### Ouverture publicitaire

`AdFreePlayerAds.tsx` contient plusieurs modes :

- **normal** : bouton « voir une pub », puis état visuel déverrouillé et bouton de continuation ;
- **auto** : le composant déclenche la publicité et accepte automatiquement ;
- **click-anywhere** : un catcher plein écran ouvre la publicité au premier clic puis accepte.

En mode direct-link, `openAdLinks()` crée dynamiquement des ancres `target="_blank"`, `rel="noopener noreferrer"`, les clique puis les retire.

Les destinations viennent de l'environnement via :

- `VITE_AD_DIRECT_URLS_ADULT` ;
- `VITE_AD_DIRECT_URL_SFW`.

Le choix +18/SFW est mémorisé sous `settings_ad_popup_adult`.

Un mode script publicitaire existe dans `src/utils/adScriptMode.ts`, mais `SCRIPT_AD_MODE_WANTED=false` au HEAD audité. S'il était réactivé, `VITE_AD_SCRIPT_SRC` fournirait le script de régie et le popup possède un délai de geste de 700 ms. Ce mode ne doit pas être utilisé comme mécanisme de bypass TV.

### Stockage / durée de vie

- `settings_ad_popup_mode` dans `localStorage` : mode normal / auto / click-anywhere ;
- `settings_ad_popup_adult` dans `localStorage` : ciblage des direct links ;
- `is_vip` dans `localStorage` : exemption VIP permanente / vérifiée par les utilitaires existants ;
- acceptation d'une pub générique : état React temporaire, pas un jeton persistant de pub.

## A.2 Gate Movix Live TV

`src/pages/LiveTV.tsx` possède une deuxième politique, indépendante du contexte générique.

Hors VIP :

1. `handleChannelClick()` lit `sessionStorage.livetv_ad_credits` ;
2. si un crédit existe, il est décrémenté et la chaîne s'ouvre directement ;
3. sinon `LiveTVPlayback.openAd(channel)` place la chaîne en attente ;
4. `AdFreePlayerAds variant="livetv"` est affiché ;
5. son `onAccept` sélectionne la chaîne et écrit `livetv_ad_credits=1`.

Le commentaire produit est explicite : une publicité couvre deux chaînes, celle qui vient d'être choisie comprise.

Le test `tests/liveTvAdPopup.browser.py` vérifie déjà cette mécanique, les trois modes de popup et l'exemption VIP.

## A.3 Gate publicitaire SwiftFlux

`src/components/SwiftfluxGate.tsx` implémente une porte distincte pour la source SwiftFlux.

Elle est **source-spécifique et imposée par le partenaire**, mais elle est pilotée par le frontend Movix et constitue donc bien une étape publicitaire avant lecture à traiter pour l'UX TV.

- URL : `VITE_SWIFTFLUX_AD_URL` ;
- hors VIP et si l'URL existe, étape initiale `ad` ;
- `openAd()` appelle `window.open(..., '_blank', 'noopener')` puis passe à `verify` ;
- ensuite Turnstile vérifie l'accès avant la résolution `/mp4/resolve`.

Le Turnstile n'est **pas** une publicité et ne doit pas être supprimé par le bypass TV. Le bon comportement TV est donc : sauter uniquement l'étape `ad`, commencer en `verify`, puis conserver la vérification et la résolution normales.

Les pages Watch évitent volontairement d'empiler le gate publicitaire Movix général et SwiftFlux : SwiftFlux ne s'affiche qu'après la sortie du gate générique.

## Exceptions existantes

Les exemptions publicitaires observées sont :

- VIP réel via `isUserVip()` / `localStorage.is_vip` et les vérifications associées ;
- variables historiques `import.meta.env.is_vip` dans certaines pages Watch ;
- absence de `VITE_SWIFTFLUX_AD_URL` pour l'étape publicitaire SwiftFlux.

Il n'existe pas encore d'exception Google TV dans ces gates au HEAD audité.

## Frontend, userscript et application

### Frontend

Le gate est principalement dans le frontend React :

- `AdFreePopupContext.tsx` ;
- `AdFreePlayerAds.tsx` ;
- `WatchMovie.tsx` ;
- `WatchTv.tsx` ;
- `WatchAnime.tsx` ;
- `LiveTV.tsx` ;
- `SwiftfluxGate.tsx`.

### Application Android

Le shell Android ne possède pas un second compteur publicitaire ni une seconde condition d'unlock. Il fournit la WebView et le contrat TV. Le bypass doit donc être fondé sur le runtime explicite `window.MOVIX_TV`, sans se faire passer pour un VIP et sans écrire un faux crédit publicitaire.

### Userscript / extension

L'audit n'a identifié aucun gate de prélecture équivalent dans le userscript ou l'extension. Ces couches servent notamment au transport, à l'extraction et aux bridges. Le gate visible et les conditions d'autorisation décrites ici vivent dans le frontend.

## B. Publicités des embeds et lecteurs tiers

Une publicité affichée **à l'intérieur** d'un iframe ou d'un lecteur tiers est distincte du gate Movix.

Le bypass TV ne doit pas :

- simuler de clic dans un iframe ;
- injecter un faux événement d'impression ;
- contourner la Same-Origin Policy ;
- prétendre supprimer une publicité appartenant au lecteur tiers ;
- modifier une réponse réseau tierce pour la masquer.

Les limites précises des iframes seront documentées au checkpoint AC.

## Matrice des chemins à modifier au checkpoint T

| Chemin | Gate actuel | Signal d'autorisation actuel | Bypass TV attendu |
|---|---|---|---|
| Watch Movie / TV / Anime | `AdFreePopupContext` + `AdFreePlayerAds` | `shouldLoadIframe` / état React d'acceptation | ne pas entrer dans le gate ; lecture normale |
| Live TV | `pendingChannel` + `livetv_ad_credits` | crédit `sessionStorage` ou acceptation popup | ouvrir la chaîne directement ; ne pas lire/écrire de crédit |
| SwiftFlux | étape `ad` de `SwiftfluxGate` | clic pub puis Turnstile | sauter l'étape pub ; conserver Turnstile |
| Embed tiers | comportement propre à l'embed | propre au tiers | aucune falsification / aucun contournement SOP |

## Conclusion d'implémentation

Le checkpoint T doit ajouter une détection frontend unique du runtime TV et l'utiliser **avant** l'entrée dans les gates :

1. `showPopupForPlayer()` doit laisser passer le chemin de lecture TV sans ouvrir `AdFreePlayerAds` ;
2. Live TV doit ouvrir directement la chaîne TV sans consommer ni créer `livetv_ad_credits` ;
3. SwiftFlux doit commencer à l'étape Turnstile sur TV, sans `window.open` publicitaire ;
4. aucun de ces chemins ne doit poser un faux VIP, un faux crédit, une fausse impression ou déclencher une publicité cachée.
