# Movix Google TV — Roadmap v1

## 0. Cadre et invariants

Dépôt de travail : `2Spartiate/MovixOpenSource`

Branche de travail : `agent/google-tv-roadmap-v1`

Base initiale : `main@ff56b3c57511c84cedc89956ba05dedba7630f1d`

Upstream historique : `movixcorp/MovixOpenSource` — lecture seule.

Contraintes permanentes :

- ne pas modifier `main` directement ;
- ne pas créer de PR vers l'upstream sans demande explicite ;
- préserver le comportement téléphone / tablette / web ;
- activer les adaptations Google TV uniquement quand l'environnement TV est détecté ;
- conserver l'authentification utilisateur existante ;
- conserver la recherche texte existante ;
- éviter toute permission microphone permanente si la dictée peut passer par l'IME Google TV ;
- toute évolution du lecteur doit préserver le comportement souris / tactile / clavier desktop ;
- fournir les APK de test directement en `.apk`, non zippés côté utilisateur.

---

## TV.0 — Audit de base et cartographie

Objectif : figer l'état technique avant modification.

À auditer :

- `app/android/app/src/main/AndroidManifest.xml`
- `app/android/app/build.gradle`
- `app/src/screens/BrowserScreen.tsx`
- injection JS / userscript dans la WebView ;
- logique Back Android ;
- logique de détection plateforme ;
- `src/components/Header.tsx`
- composants de cartes / carrousels ;
- favoris overlay ;
- recherche ;
- authentification / profil ;
- `src/components/HLSPlayer.tsx`
- `src/components/LiveTVPlayer.tsx`
- `src/pages/FranceTV/FranceTVPlayer.tsx`
- `src/utils/playerControlInteraction.ts`
- workflows GitHub Actions existants.

Livrable :

- inventaire des cibles focusables ;
- inventaire des interceptions clavier `Arrow*` ;
- liste des composants qui reposent sur hover ;
- liste des lecteurs internes vs iframe cross-origin ;
- baseline des tests/builds existants.

Critère de sortie :

- aucun changement produit ;
- périmètre TV clairement identifié.

---

## TV.1 — Présence native Google TV

Objectif : rendre l'APK installée visible et correctement déclarée sur Android TV / Google TV.

À implémenter :

- `CATEGORY_LEANBACK_LAUNCHER` ;
- feature `android.software.leanback` non bloquante si nécessaire pour conserver Android mobile ;
- touchscreen déclaré non requis ;
- bannière TV conforme aux recommandations Android TV ;
- maintien du launcher mobile actuel ;
- vérification du merged manifest.

À vérifier :

- l'app apparaît dans le launcher Google TV ;
- l'app reste installable sur Android téléphone ;
- aucune régression deep link / Cast / PiP.

---

## TV.2 — Détection TV native et contrat WebView

Objectif : activer les adaptations uniquement sur TV.

Approche privilégiée :

- détection native Android via `UiModeManager` / `UI_MODE_TYPE_TELEVISION` ;
- exposer un marqueur explicite au contenu WebView, par exemple :
  - classe racine `movix-tv`,
  - variable JS dédiée,
  - ou événement bridge ;
- ne pas inférer le mode TV uniquement depuis la taille d'écran ou le user-agent.

Contrat :

- téléphone : comportement actuel inchangé ;
- TV : CSS/JS focus spécifiques actifs ;
- possibilité de désactiver temporairement la couche TV pour diagnostic.

---

## TV.3 — Moteur de navigation spatiale D-pad

Objectif : remplacer le scroll web incrémental par une navigation TV de type application native.

Comportement cible :

- `Left / Right` : élément focusable géométriquement le plus proche sur l'axe horizontal ;
- `Up / Down` : élément focusable géométriquement le plus proche dans la rangée / zone suivante ;
- priorité aux cibles dans le même couloir visuel ;
- `Enter / DPAD_CENTER` : activation ;
- le scroll devient une conséquence du changement de focus, jamais l'action principale ;
- `scrollIntoView` centré ou nearest pour garder la cible visible ;
- mémoriser la dernière carte focusée par rangée quand cela améliore le retour vertical.

À éviter :

- petits scrolls de quelques dizaines/centaines de pixels ;
- focus vers éléments invisibles ;
- focus vers éléments `display:none`, `visibility:hidden`, opacité 0 non interactive ou dimensions nulles ;
- pièges de focus dans les overlays.

Robustesse :

- `MutationObserver` pour contenus React chargés dynamiquement ;
- recalcul après changement de route, chargement de rangée, ouverture de modal ;
- pas de boucle de focus.

---

## TV.4 — Header TV

Objectif : réduire le header aux cibles pertinentes pour une télécommande.

TV-only :

- logo / lien Movix : visible mais non focusable ;
- icône / lien Telegram : non focusable, avec option de masquage TV si nécessaire ;
- champ recherche : focusable ;
- bouton / avatar compte utilisateur : focusable ;
- menus nécessaires au compte : focusables ;
- éliminer les cibles décoratives.

Recherche :

- conserver un vrai `input` ;
- ouverture normale du clavier Google TV ;
- permettre la dictée via le micro de la télécommande quand l'IME la propose ;
- ne pas demander `RECORD_AUDIO` uniquement pour cette fonction ;
- retour du focus cohérent après fermeture du clavier.

---

## TV.5 — Carrousels films / séries

Objectif : une rangée TV simple et prévisible.

TV-only :

- les cartes/posters sont les cibles principales ;
- retirer du parcours de focus les flèches gauche/droite de scroll ;
- masquer ou rendre non focusable les flèches de scroll si elles restent utiles visuellement ;
- retirer du parcours de focus l'étoile favoris en overlay ;
- idéalement masquer l'étoile overlay sur TV si elle gêne la lisibilité ;
- conserver l'accès aux favoris depuis la fiche détaillée / espace compte.

Navigation :

- `Left / Right` : carte précédente/suivante ;
- le carrousel suit automatiquement la carte focusée ;
- `Down` : cible pertinente de la rangée suivante ;
- `Up` : retour cohérent vers la rangée précédente.

À vérifier :

- home ;
- tendances ;
- catégories ;
- recommandations ;
- pages de profil ;
- listes personnelles ;
- résultats de recherche.

---

## TV.6 — Fiches films / séries et navigation de page

Objectif : transformer les pages longues en parcours de focus.

À adapter :

- CTA principaux ;
- saisons / épisodes ;
- sources ;
- boutons secondaires ;
- commentaires si accessibles TV ;
- listes associées ;
- boutons de retour.

Règles :

- `Down` descend vers la prochaine zone interactive, pas vers un scroll arbitraire ;
- `Up` revient vers la zone précédente ;
- restauration du focus après retour depuis une sous-page / modal ;
- aucun saut imprévisible vers le header.

---

## TV.7 — Lecteur HLS Movix

Objectif : rendre tous les contrôles du lecteur réellement utilisables au D-pad.

Principes :

- les boutons du lecteur font partie du graphe de focus ;
- tant qu'un contrôle du player possède le focus, la barre de contrôles reste visible ;
- les contrôles ne doivent pas disparaître sous le focus ;
- ajouter un style `focus-visible` évident sur TV.

Conflit actuel à corriger :

- les handlers globaux `ArrowLeft / ArrowRight` de seek ne doivent pas intercepter les flèches quand une commande interactive possède le focus ;
- même principe pour `ArrowUp / ArrowDown` et le volume ;
- utiliser `isPlayerControlInteractionTarget` comme garde commune quand pertinent ;
- laisser les `input[type=range]` gérer leurs propres flèches.

Comportement cible :

- focus sur une commande : D-pad navigue entre commandes ;
- focus hors contrôles : raccourcis seek/volume peuvent rester disponibles si cela reste naturel ;
- `OK` active la commande focusée.

---

## TV.8 — LiveTVPlayer / FranceTVPlayer / autres players internes

Objectif : harmoniser les lecteurs internes.

À traiter :

- `LiveTVPlayer.tsx` ;
- `FranceTVPlayer.tsx` ;
- autres lecteurs custom trouvés pendant TV.0.

Points spécifiques :

- neutraliser les `preventDefault()` Arrow* quand le focus est sur un contrôle ;
- conserver les controls visibles sur `focus-within` ;
- volume slider visible au focus, pas uniquement au hover ;
- Settings / Sources / Subtitles / Quality navigables au D-pad ;
- Cast / AirPlay / Fullscreen / PiP focusables quand disponibles.

---

## TV.9 — Menus player et restauration du focus

Objectif : comportement modal TV cohérent.

À implémenter :

- ouverture d'un menu :
  - mémoriser le bouton déclencheur ;
  - focus automatique sur la première option pertinente ;
- fermeture via Back / Escape :
  - fermer uniquement le panneau courant ;
  - rendre le focus au bouton déclencheur ;
- navigation interne sans fuite vers l'arrière-plan ;
- fermeture du player : retour vers l'élément qui a lancé la lecture quand possible.

---

## TV.10 — Iframes cross-origin

Objectif : définir un comportement sûr pour les players tiers.

Constat :

- certains lecteurs externes sont chargés dans des iframes cross-origin ;
- le parent Movix ne peut pas garantir l'accès DOM aux contrôles internes.

Stratégie :

- détecter ces cas ;
- ne pas prétendre offrir une navigation complète si le player tiers ne coopère pas ;
- privilégier les lecteurs internes quand plusieurs options existent ;
- documenter le fallback ;
- vérifier si certains embeds acceptent nativement les key events D-pad.

---

## TV.11 — Bouton Back Android

Objectif : obtenir une hiérarchie de retour de type application TV.

Priorité proposée :

1. fermer menu / modal actif ;
2. fermer contrôles secondaires du player ;
3. sortir du plein écran si actif ;
4. quitter le player vers la fiche ;
5. navigation WebView précédente ;
6. quitter l'app seulement à la racine.

À vérifier avec :

- Android Back ;
- Escape si mappé par la télécommande ;
- historique SPA.

---

## TV.12 — Compte utilisateur et authentification

Objectif : conserver une expérience compte utilisable à la télécommande.

À tester :

- ouverture du menu compte ;
- login ;
- sélection profil ;
- logout ;
- formulaires ;
- clavier TV ;
- retour depuis le clavier ;
- focus initial et restauration du focus.

Aucune simplification ne doit supprimer une fonction essentielle de compte.

---

## TV.13 — Recherche TV

Objectif : recherche utilisable rapidement à la télécommande.

À tester :

- focus depuis le header ;
- clavier Google TV ;
- dictée micro via IME si disponible ;
- validation ;
- suggestions ;
- résultats ;
- retour aux résultats après fiche ;
- conservation du texte de recherche.

Option ultérieure :

- bouton micro explicite seulement si une intégration native apporte un vrai bénéfice et sans imposer une permission excessive.

---

## TV.14 — Accessibilité visuelle du focus

Objectif : toujours savoir où se trouve le focus à distance.

À définir :

- ring / outline TV clair ;
- légère élévation ou scale sur cartes si compatible avec l'UI ;
- contraste suffisant ;
- aucune dépendance exclusive au hover ;
- animation courte et non gênante.

Le style TV doit rester isolé du desktop/mobile.

---

## TV.15 — Non-régression mobile / desktop

Objectif : garantir que la couche TV ne dégrade pas les autres plateformes.

À couvrir :

- Chrome desktop ;
- navigation clavier desktop ;
- Android téléphone ;
- tactile ;
- iOS si les changements touchent le code partagé ;
- souris / hover ;
- HLS ;
- Cast ;
- PiP ;
- authentification ;
- recherche.

---

## TV.16 — Tests automatisés navigation

Objectif : couvrir au maximum les règles sans TV physique.

Tests unitaires :

- filtrage des éléments focusables ;
- score géométrique Left/Right/Up/Down ;
- exclusion des overlays non pertinents ;
- priorité de rangée ;
- restauration de focus.

Tests DOM / navigateur :

- header TV ;
- carrousel ;
- recherche ;
- modals ;
- player controls ;
- Arrow* non interceptées sur contrôle interactif ;
- barre du player maintenue visible sous focus.

Limite assumée :

- un smoke-test réel sur Google TV reste autoritaire pour le ressenti D-pad.

---

## TV.17 — GitHub Actions Android

Objectif : produire un APK sans machine locale.

Workflow dédié branche TV :

- Ubuntu runner ;
- checkout ;
- Node selon le projet ;
- installation dépendances ;
- génération userscript embarqué si nécessaire ;
- JDK 17 ;
- Android SDK requis ;
- Gradle wrapper ;
- tests ciblés ;
- build APK debug ou release de test ;
- calcul SHA-256 ;
- upload artifact.

Ne pas modifier les workflows upstream inutilement.

---

## TV.18 — Identité du package et signature

Décision à prendre avant diffusion régulière.

Option A — même package `com.movix.app` :

- simple pour un premier test ;
- une signature différente peut empêcher l'installation par-dessus l'APK upstream ;
- l'updater upstream peut ensuite télécharger un APK signé différemment.

Option B — variante TV avec applicationId distinct, par exemple `com.movix.app.tv` :

- cohabitation avec l'app upstream ;
- meilleure isolation ;
- updater à désactiver ou rediriger explicitement ;
- vérifier FileProvider, deep links, Cast et configuration Android.

Pour les premiers smoke-tests, documenter précisément l'option choisie.

---

## TV.19 — Livraison APK directe

Objectif : fournir à l'utilisateur un lien direct vers un `.apk`.

Pipeline :

1. GitHub Actions produit l'APK ;
2. artifact Actions temporaire ;
3. récupération du ZIP par le connecteur GitHub ;
4. matérialisation dans l'environnement ChatGPT ;
5. extraction ;
6. vérification taille + SHA-256 ;
7. copie vers `/mnt/data/Movix-TV-<version>.apk` ;
8. lien Sandbox direct vers le fichier APK.

L'utilisateur ne doit pas avoir à dézipper l'artifact.

---

## TV.20 — Hygiène artifacts GitHub

Objectif : ne pas accumuler les APK dans GitHub Actions.

Mesures :

- `retention-days: 1` comme filet de sécurité ;
- après téléchargement réussi, supprimer l'artifact si l'API/permission disponible le permet ;
- sinon documenter la limitation et s'assurer de la rétention minimale ;
- ne pas committer des APK volumineux dans Git sauf décision explicite.

---

## TV.21 — Smoke-test réel Google TV

Checklist finale autoritaire :

- app visible dans launcher ;
- ouverture télécommande uniquement ;
- header ;
- recherche ;
- dictée si IME compatible ;
- compte ;
- rangées home ;
- changement de rangée sans micro-scroll ;
- fiches ;
- épisodes ;
- ouverture player ;
- tous contrôles player ;
- settings / sous-titres / source / qualité ;
- Back ;
- reprise du focus ;
- fermeture / relance ;
- Cast si utilisé.

Les observations du test réel alimentent uniquement des corrections ciblées.

---

## TV.22 — Gel v1

Conditions :

- build Android PASS ;
- tests TV automatisés PASS ;
- aucune régression mobile critique ;
- smoke-test réel validé ;
- APK identifiée par SHA-256 ;
- roadmap mise à jour avec les écarts connus ;
- `main` toujours intacte ;
- aucune écriture sur `movixcorp/MovixOpenSource`.

Livrable final v1 :

- branche TV gelée ;
- commit final documenté ;
- APK directe ;
- SHA-256 ;
- notes de test ;
- liste courte des limitations restantes, notamment éventuels players iframe tiers.
