# Android TV manifest — session 1

Checkpoint D.

Base avant modification : `c1a3592f8fbb3ccbc3afa8067272e762dbbe3290`.

## État avant

`AndroidManifest.xml` disposait :

- du launcher mobile `android.intent.category.LAUNCHER` ;
- des deep links Movix ;
- du PiP ;
- de Cast ;
- du VPN DNS ;
- de l'updater / `FileProvider` ;
- des services foreground existants.

Il ne disposait pas :

- de `LEANBACK_LAUNCHER` ;
- de déclaration `android.software.leanback` ;
- de déclaration `android.hardware.touchscreen required=false` ;
- de `android:banner`.

## État après

Ajouts strictement TV :

1. `android.software.leanback` avec `required=false`.
   - Une seule APK reste éligible téléphone + TV.
   - Le téléphone n'est pas exclu.

2. `android.hardware.touchscreen` avec `required=false`.
   - La TV n'est pas filtrée pour absence d'écran tactile.
   - Aucun code mobile/touch n'est supprimé.

3. Un intent-filter séparé `MAIN + LEANBACK_LAUNCHER` sur `.MainActivity`.
   - Le filtre `MAIN + LAUNCHER` historique reste intact.
   - Les deep links restent intacts.

4. `android:banner="@drawable/tv_banner"` sur l'application.

5. `drawable-xhdpi/tv_banner.xml`.
   - Ressource locale uniquement.
   - Dérivée du launcher icon Movix déjà présent.
   - Aucun asset externe et aucune dépendance graphique ajoutés.

## Bannière : portée exacte

La documentation Android TV demande pour une publication finale une bannière xhdpi 320×180 avec le nom de l'application intégré dans l'image, et des variantes localisées si nécessaire.

Le dépôt ne contenait pas de bannière TV 16:9 existante. Pour ne pas inventer un nouveau branding approximatif pendant cette session d'infrastructure, le checkpoint ajoute un drawable TV minimal qui compose le **launcher icon officiel existant** sur le fond sombre déjà cohérent avec l'application.

Cette ressource suffit à établir et tester le contrat `android:banner` / launcher. Avant publication Google Play TV, elle devra être remplacée par un asset raster 320×180 approuvé si le launcher icon existant ne contient pas déjà le wordmark requis.

## Éléments volontairement inchangés

- `applicationId` / namespace ;
- `MainActivity` ;
- `configChanges` incluant déjà `uiMode` ;
- PiP ;
- Cast ;
- VPN DNS ;
- updater ;
- `FileProvider` ;
- deep links ;
- launcher téléphone ;
- thème ;
- permissions.

## Risques

- La présence dans le launcher TV ne signifie pas encore que toute la navigation D-pad est utilisable.
- La bannière de session 1 est une fondation technique, pas l'asset marketing final.
- Certains appareils/launchers affichent l'icône plutôt que la bannière.
- Le package/signature des APK de test reste identique au projet historique.

## Validation réalisable à ce checkpoint

- Manifest modifié de façon additive.
- XML du manifest et du drawable vérifiés comme bien formés avant commit.
- Les déclarations téléphone, deep links, PiP, Cast, VPN et updater sont conservées.
- Aucun workflow Android n'existe encore sur cette branche, donc le merged manifest Gradle et l'APK seront validés au checkpoint G dans la limite de l'environnement disponible.
