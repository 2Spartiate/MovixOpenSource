# 🧭 MOVIX — BRANCHE DE RÉFÉRENCE ACTIVE (Google TV)

**Branche de travail de référence : `agent/movix-active-tv-upnext-v1`.**

**Lien direct :** https://github.com/2Spartiate/MovixOpenSource/tree/agent/movix-active-tv-upnext-v1

## Règles de continuité

- Toutes les prochaines corrections et compilations personnalisées Google TV doivent partir de cette branche (ou de sa remplaçante désignée explicitement).
- Conserver `main` intact : il s'agit de l'amont historique, pas de la branche personnalisée active.
- Ne pas repartir d'une ancienne branche `agent/google-tv-*`, `agent/movix-upstream-sync-v1` ou `agent/movix-ad-page-keyword-guard-v1` pour les évolutions suivantes.
- La CI Android TV est activée sur cette branche et publie un APK autonome.
- Les corrections du frontend React embarquées dans le dépôt ne sont pas automatiquement déployées sur le site distant ; l'APK applique aussi une protection TV dédiée pour l'overlay de fin d'épisode.

## Origine

Branche issue de `agent/movix-ad-page-keyword-guard-v1`
au commit `129389c7be4e310a9ab12c18fa2ae376ec97790a`
pour conserver les évolutions précédentes (upstream récent, publicité,
Bridge WebView, lecteurs, navigation TV, contrôle parental).

## Correctif À suivre

- Supprimer le déclencheur implicite 95 % en l'absence de préférences.
- Détecter le générique (`credits` prioritaire sur `outro`) sans
  afficher le panneau plus tôt que 60 s avant la fin (30 s pour les épisodes
  de moins de 35 min).
- Utiliser 60 s / 30 s comme repli sans segment disponible.
- Respecter les seuils explicitement choisis et stockés.
- Sur TV, sélectionner par défaut « Plus tard », rendre Retour opérationnel
  et réduire l'occupation du panneau et du voile.
- Compatibilité APK : masquer jusqu'au bon moment le panneau anciennement
  déclenché à 95 % par le site distant.

## Important : branche de référence ≠ branche par défaut GitHub

Ce fichier marque **la branche de travail active**. Le réglage GitHub
`default_branch` peut encore être `main` tant qu'il n'a pas été modifié
par un propriétaire du dépôt dans *Settings > General > Default branch*
(ou *Settings > Branches* selon l'interface). Cette désignation n'a
pas besoin de modifier ni fusionner `main`.
