# MOVIX Google TV — Correction focus affiches / navigation SPA

## Retour matériel ayant déclenché la correction

Test utilisateur sur l'APK précédente :

- certaines étoiles de favoris étaient focusables mais les affiches ne l'étaient pas ;
- les cartes de plateformes / networks étaient focusables ;
- après activation d'une plateforme, le focus sautait sur la recherche ;
- le contenu pouvait apparaître noir après la transition de route ;
- une recherche depuis cet état ne donnait pas un comportement utilisable.

## Causes établies dans le code

### Affiches

Dans le carrousel principal, le lien de détail est une couche transparente absolue au-dessus de la carte :

`<Link ... className="absolute inset-0 ...">`

L'injecteur précédent cherchait surtout des liens contenant directement une image. Il pouvait donc manquer ces liens transparents, alors que le bouton étoile, lui, était un vrai bouton focusable.

### Transition SPA

Lorsqu'un lien React Router change de route, l'ancien élément focusé disparaît avant que les rangées de contenu lazy ne soient montées.

Le moteur de récupération de focus pouvait alors choisir le champ de recherche du header comme première cible disponible.

## Corrections

### Proxy de focus visible pour les cartes

Sur Google TV uniquement :

- les liens média `/movie/*`, `/tv/*`, `/collection/*` sont reconnus ;
- pour un lien transparent absolu, son conteneur visuel devient la cible TV :
  - `data-tv-card-proxy`
  - `data-tv-card`
  - `data-tv-focus`
  - `tabindex=0`
  - identifiant stable `media:<path>`
- le lien transparent interne sort du graphe de focus ;
- Enter / Space sur le proxy déclenche le vrai lien React Router.

Le téléphone n'utilise pas cette conversion de proxy.

### Favoris

Les boutons étoile de favoris sont supprimés dans le DOM distant des cartes média.

Le frontend source a également été aligné :

- `src/components/EmblaCarousel.tsx` ;
- `src/components/SearchCard.tsx`.

Les étoiles purement informatives de notation ne sont pas visées.

### Focus après navigation

Le moteur D-pad :

- privilégie une vraie carte média avant la recherche ;
- après une transition SPA, attend jusqu'à 5 s que le contenu lazy apparaisse ;
- vérifie toutes les ~250 ms et prend la carte dès qu'elle existe, sans attendre toute la fenêtre de 5 s ;
- remet le scroll en haut lors d'une transition ;
- évite de donner prématurément le focus au champ de recherche.

### Ordre d'injection

Le marqueur TV est désormais établi avant les overrides du site distant :

1. popup blocker ;
2. TV bootstrap ;
3. live-site overrides ;
4. bridge/shims ;
5. D-pad runtime.

## Validation

Branche : `agent/google-tv-roadmap-v1`

HEAD produit testé par CI :

`ccede6e87f79f6d70ae09830c0e93ee7e963e5a7`

Workflow :

`Android TV foundations`

Run :

`35785388767`

Résultat : **SUCCESS**

- contrats TV / D-pad / DOM distant : PASS ;
- TypeScript : PASS ;
- frontend production : PASS ;
- Android standalone release : PASS ;
- manifest TV + mobile : PASS ;
- bundle JS embarqué : PASS ;
- artefact APK : PASS.

APK extrait :

- taille : `72 551 430` octets ;
- SHA-256 : `bee71b70d4e1491725ac7c76a69e1470abe4fe6ac92afa92069d89ed28ea88d9`.

## Point restant à confirmer sur matériel

La correction de la cible d'affiche est directe et mécanique.

Le comportement noir après clic sur une plateforme peut provenir du mauvais focus / position de scroll pendant le montage lazy de la nouvelle route, maintenant corrigé, mais un problème propre à la page provider / à ses requêtes réseau reste possible. Ne pas considérer ce point comme matériellement validé avant le prochain smoke-test.
