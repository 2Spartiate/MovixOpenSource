# Migration Movix upstream V1

## Références et périmètre

- Dépôt : `2Spartiate/MovixOpenSource`.
- Source personnalisée intacte : `agent/parental-controls-v1`, `030e68eef05a20845a1e1d97e83913c5b89986c7`.
- Branche de travail : `agent/movix-upstream-sync-v1`.
- Upstream figé : `movixstream/MovixOpenSource/main`, `0e7cd866fa5bbb248c2e24c1d5d69e7f06e38ce5`.
- Ancêtre commun : `ff56b3c57511c84cedc89956ba05dedba7630f1d`.
- Main du fork reste à cet ancêtre. Aucun push vers main, aucune PR.
- 32 commits upstream ; fusion Git à trois voies avec conservation du parent upstream original. Le nouvel upstream est un dépôt indépendant, pas un membre du réseau de forks historique : les objets Git sont importés par un workflow ponctuel limité à la branche de migration. Le push Actions ne pouvant pas modifier les workflows officiels, la connexion GitHub autorisée publie le même arbre vérifié et le vrai parent upstream. Les deux fichiers de bootstrap sont supprimés de l'arbre final.
- Commit de fusion : `ac2227d15aca7235b10b30780bd85715a050c9e5`, second parent `0e7cd866fa5bbb248c2e24c1d5d69e7f06e38ce5`, arbre `88bfb7e39620a8bebab750c0cff99c05084e85bf`.

## Nouveautés officielles

- Application 2.6.5, build 42 ; nouveaux domaines et configuration dynamique.
- Site primaire `movix.luxe`, résolveur de repli `movix.online`, miroirs college/men/fun/show/date/chat/golf/cloud/cash. Le résolveur essaie ses points de découverte, la configuration distante, le cache puis le repli intégré.
- DNS Android : vrai DNS-over-HTTPS vers les IP Cloudflare, client TLS partagé, pool de huit workers, validation des paquets, sockets protégés et replis UDP/TCP. Les IP publiques Cloudflare ne sont pas routées dans le tunnel DNS virtuel.
- Démarrage : activation DNS attendue, attente bornée, découverte et chargement de la page après le choix initial. Reprise bornée du même miroir après ERR_NETWORK_CHANGED.
- Les défis Cloudflare HTTP 403/503 restent dans la WebView plutôt que d'être pris pour une panne de miroir. Cookies, JavaScript, stockage et documents about:srcdoc conservés, capacités du bridge limitées à la page principale.
- Correctifs fsvid/vidzy (clé, transport/CDN), Uqload/sous-titres, Cast, HLS, détection MP4, chargement des lecteurs et clavier.
- Évolutions web, sources, API, branding, palette d'images et compatibilité Chromium 68 incorporées par la fusion ; pas de déploiement web ou serveur depuis cette session.

## Résolution des conflits

28 chemins initialement en conflit : 18 fichiers texte et 10 anciennes icônes raster modifiées upstream mais déjà supprimées dans la variante personnalisée.

- DNS : l'implémentation DoH officielle remplace les fonctions UDP seules. Elle conserve la route DNS virtuelle et les requêtes parallèles de notre variante.
- App native : attente DNS upstream avec le montage ordonné existant ; reprise réseau upstream plus notre récupération unique de la WebView ; pont, politique de fenêtres et injections parentales conservés.
- Lecteur HLS : contrôles et clavier upstream avec priorité au moteur et aux raccourcis TV V22. Le focus conserve la barre visible et les menus TV empêchent son escamotage. Abonnement clavier stable via ref, sans conserver les anciennes fermetures React. Les états lus au rendu sont déclarés avant usage.
- Carrousels, recherche et hero : marqueurs et focus TV combinés aux changements officiels. Cycle TV de dix secondes, cycle mobile de six secondes ; rendu classique TV, options Morph conservées sur mobile.
- Header : logo PNG personnalisé et marqueurs TV conservés, nouvelle destination Telegram intégrée.
- Routes : gardes parentaux combinés aux nouvelles clés de montage des pages/catalogues.
- Swiftflux/AdFreePopup : comportement personnalisé de continuation conservé, sans accorder de droits VIP serveur.
- Icônes : suppression des dix rasters obsolètes maintenue ; ressources personnalisées adaptatives, vectorielles et télévision conservées.
- Tests : contrats adaptés aux fonctions réorganisées et au nouveau lien Telegram ; les tests du logo, du focus et du contrôle parental restent présents.

## Adaptation au site chargé à distance

Les fichiers frontend du dépôt ne sont pas le contenu distribué dans l'APK : la WebView charge le site distant. Les adaptations nécessaires sont donc aussi dans l'injection commune.

- Reconnaissance du nouveau SVG Movix par son aria-label ; masquage visuel du SVG et affichage du logo personnalisé sans remplacer les enfants de React.
- Le hero upstream ne comporte plus qu'une entrée de fiche « Plus d'infos ». Sur TV, cette même entrée reçoit le rôle, le label et le style « Lire », avec son lien et son handler React conservés. Sur mobile, elle reste inchangée.
- Trois tests exécutent les fonctions injectées sur ces formes DOM, dont l'isolation mobile.

## Vérification du checkpoint de fusion

- TypeScript application mobile et configuration parentale ciblée : réussis.
- Contrats ciblés TV, spatial, télécommande, parental, Cloudflare et DOM upstream : réussis.
- Suite mobile complète après migration : 354 tests, 348 réussis, 6 échecs également présents dans la source personnalisée. Ils concernent deux contrats PiP et quatre contrats d'une ancienne tentative de démarrage/résilience TV. Leur présence est consignée, pas masquée par une modification de leurs attentes.
- Le frontend upstream possède déjà des diagnostics TypeScript globaux (273 observés avec le lockfile actuel et `--ignoreDeprecations 5.0`). Le build Vite ne remplace pas ce contrôle. Les erreurs d'intégration détectées pendant la fusion sont corrigées ; le contrôle global n'est pas annoncé vert.
- Validation native Android et politique anti-mise à jour : checkpoint suivant.
- Aucun appareil TV matériel utilisé ; pas de lecture réelle ou de tunnel VPN matériel revendiqué.

## Désactivation des mises à jour APK

- Politique embarquée et gelée dans `app/src/config/appUpdates.ts` : Android désactivé, iOS conserve son comportement. Aucune configuration distante ni préférence utilisateur ne peut activer cette politique Android.
- `AppShell` appelle toujours le hook React, en lui passant explicitement la politique. L'affichage des deux interfaces de mise à jour est également protégé, même en présence d'un état React obsolète.
- Le hook ne vérifie aucune version Android, ne s'abonne pas à la reprise pour les mises à jour et ne reprend aucune vérification, aucun téléchargement ni aucune installation. Ses actions sont inertes.
- Les services refusent aussi la récupération d'un manifeste APK, le lancement d'un téléchargement, le polling, l'ouverture des paramètres d'installation et l'installation directe. La lecture du numéro de version pour les paramètres reste disponible.
- Protection native indépendante : `BuildConfig.APK_UPDATES_ENABLED=false`. Le module Android refuse téléchargement, paramètres et installation avant tout effet système ; la permission d'installation est supprimée du manifeste fusionné.
- Seule la clé `update:pendingDownload` est nettoyée. Si elle contient un identifiant de téléchargement valide, celui-ci est annulé via DownloadManager ; aucun téléchargement n'est interrogé ou installé. Les autres préférences, PIN, historique et cache d'adresses ne sont pas modifiés.
- La découverte des adresses, les appels réseau du site, les mises à jour de son contenu dans la WebView et le DNS restent indépendants de cette politique.

### Défaillances couvertes par les tests de non-réactivation

Les E2E sur un appareil absent de cet environnement ne couvrent pas un état hérité du DownloadManager ni un appel direct au bridge natif. Les tests isolés exécutent les modules compilés, leurs effets et les appels natifs pour couvrir : démarrage mobile/TV, résolution différée de la configuration, reprise, appel avec `enabled:true`, actions conservées, manifeste obligatoire, téléchargement en cours/terminé, JSON corrompu, identifiant invalide, annulation échouée et nouveau démarrage. Ils vérifient également la conservation des données sans rapport avec l'updater et le masquage de l'interface malgré un hook renvoyant un état périmé.

Commande reproductible : `cd app && npm ci && npm run prebuild && node --test tests/androidAppUpdatesDisabled.test.mjs tests/upstreamDomCompatibility.test.mjs tests/iosPlatformParity.test.mjs && npx tsc --noEmit`. Résultat local : 14 tests réussis et TypeScript réussi. Deux tests Robolectric complètent la protection native ; ils sont exécutés par `:app:testReleaseUnitTest` dans le workflow Android de cette branche.
