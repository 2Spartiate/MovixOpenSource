# Wrapped A

Snapshot du frontend au commit `f1c90a390a97ac575542fd76e8011e269543eb89` pour la comparaison par URL `version=A`. Le lecteur, les visuels, les animations et les exports restent ceux de cette version.

Adaptations limitées : chemins d'import, types, données reçues en props et clonées avant l'ajout des slides historiques, fermeture commune. L'authentification et le chargement des statistiques restent dans `pages/WrappedPage.tsx` ; le cache historique `sessionStorage` n'est pas réactivé. Les anciennes vidéos utilisent toujours les métadonnées publiques TMDB.

Ces fichiers sont chargés à la demande uniquement pour A. La version B utilise les composants et utilitaires actuels. Faire évoluer B dans ces derniers sans modifier ce snapshot.
