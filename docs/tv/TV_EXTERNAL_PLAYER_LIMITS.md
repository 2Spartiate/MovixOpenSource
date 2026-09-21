# Movix Google TV — limites des players externes / iframes

## Portée

État documenté après le checkpoint AB de Session 3, branche `agent/google-tv-roadmap-v1`, HEAD de départ AC `c3d53f4bbbd7994cef44cce5857f3d89e9cff292`.

Ce document sépare ce que Movix contrôle réellement de ce qui appartient à un document embarqué tiers.

## Modèle de sécurité

Un `iframe` de provenance différente de la page Movix est **cross-origin**.

La Same-Origin Policy interdit au document Movix de :

- lire ou modifier le DOM interne de cet iframe ;
- rechercher ses boutons, sliders ou menus ;
- forcer son focus interne élément par élément ;
- installer ses handlers D-pad dans le document tiers par accès DOM direct.

Le checkpoint AC ne contourne pas cette frontière.

La WebView Android renforce volontairement cette séparation : `WebViewBrowser.tsx` utilise

`injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}`.

Le bridge, le userscript et le runtime D-pad Movix sont donc injectés dans le document principal, pas dans les sous-frames. Cette politique existe aussi pour laisser notamment les frames Turnstile hors du bridge Movix.

## VideoPlayer / Frembed

`src/components/VideoPlayer.tsx` charge :

`${getFrembedBase()}/api/film.php?id=...`

La base Frembed est distante (`https://frembed.surf` en fallback, avec configuration distante possible). En production, cet iframe doit donc être considéré cross-origin par défaut.

Le composant historique contient une tentative d'accès à `iframe.contentWindow.document` afin d'injecter un script anti-devtool. Cette opération n'est fiable que pour un document réellement same-origin.

**Politique TV Session 3 :**

- le runtime TV n'exécute plus cette tentative d'accès DOM ;
- l'élément `iframe` reçoit `tabIndex=0` et `data-tv-focus` uniquement en runtime TV ;
- le moteur spatial peut donc déplacer le focus sur l'iframe lui-même ;
- une fois le focus entré, les touches sont traitées selon les capacités clavier du lecteur embarqué ;
- Movix ne prétend pas connaître ni contrôler ses boutons internes.

Le `sandbox="allow-scripts allow-same-origin"` ne rend pas Frembed same-origin avec Movix : il permet au document embarqué de conserver son origine, donc la SOP continue de s'appliquer entre origines différentes.

## LiveTVPlayer — streams embed

`LiveTVPlayer` distingue les streams natifs HLS/DASH/MPEGTS des streams `_isEmbed`.

Pour `_isEmbed` :

- Movix n'initialise pas HLS/DASH/MPEGTS ;
- un `iframe src={activeEmbedUrl}` plein écran est rendu ;
- Cast direct est explicitement refusé pour cet embed, car le receiver attend une URL média et non une page HTML ;
- les contrôles flottants Movix restent au-dessus de l'iframe pour Back / serveur / plein écran externe selon le chemin existant.

Session 3 rend également cet iframe focusable sur TV via `tabIndex=0` + `data-tv-focus`.

La prise en charge réelle de :

- ArrowLeft / ArrowRight ;
- ArrowUp / ArrowDown ;
- Enter / OK ;
- lecture/pause ;
- menus qualité/sous-titres ;
- fullscreen interne ;

dépend ensuite du code du fournisseur embarqué.

## Focus WebView et D-pad

Le moteur spatial du document principal découvre les cibles à chaque touche. Avec `data-tv-focus`, l'iframe apparaît comme **une cible unique**.

Il peut :

1. déplacer le focus de la barre Movix vers l'iframe ;
2. laisser la WebView transmettre les événements clavier au browsing context focusé ;
3. récupérer ensuite le focus si l'utilisateur revient vers une cible du document principal et que le navigateur / lecteur tiers libère correctement la navigation.

Il ne peut pas :

1. calculer spatialement la position des boutons internes du lecteur tiers ;
2. garantir que le lecteur tiers accepte les keycodes de la télécommande ;
3. convertir un lecteur purement tactile en lecteur D-pad ;
4. imposer une hiérarchie Back interne à un DOM cross-origin ;
5. fermer un menu tiers inaccessible au document parent.

## Cas same-origin

Un iframe réellement same-origin pourrait techniquement être inspecté par le frontend, mais Session 3 ne crée pas de seconde instance du moteur spatial à l'intérieur de ce document.

Raison : multiplier les runtimes dans les frames introduirait :

- doubles handlers clavier ;
- conflits de focus ;
- incertitude sur la provenance des événements ;
- exposition inutile du bridge/userscript dans des sous-documents.

La politique reste donc identique : l'iframe est une cible de focus, son contenu reste propriétaire de son clavier.

## Publicités tierces

Les publicités éventuellement rendues **dans** un iframe ou lecteur tiers ne sont pas le gate Movix traité aux checkpoints S/T.

Session 3 ne :

- clique pas une publicité tierce ;
- ne simule pas d'impression ;
- ne masque pas le DOM publicitaire d'un iframe cross-origin ;
- ne modifie pas les réponses réseau du lecteur tiers pour contourner sa publicité.

## Conséquences produit

### Lecteurs internes Movix

HLSPlayer, LiveTVPlayer natif et FranceTVPlayer sont les chemins TV les plus contrôlables :

- focus visible ;
- D-pad ;
- menus ;
- Back hiérarchique ;
- auto-hide maîtrisé.

### Embeds externes

Support « best effort » :

- entrée de focus possible ;
- transmission clavier par la WebView possible ;
- comportement interne dépendant du fournisseur.

Si un fournisseur tiers n'a aucun support clavier, la bonne direction produit reste de privilégier une source directe / un lecteur interne Movix lorsqu'elle existe, plutôt que de contourner la SOP.

## Limite de validation

Ce checkpoint valide le contrat de code et la frontière de sécurité. Il ne constitue pas une validation matérielle Google TV des keycodes propres à chaque fournisseur embarqué.
