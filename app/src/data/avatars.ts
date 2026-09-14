// Sous-ensemble curate du catalogue complet (src/data/new_avatars.ts cote
// web, 1477 lignes / plusieurs centaines d'avatars) — servis en statique
// depuis le site (${primaryUrl}${path}), donc affichables directement sans
// rien embarquer dans l'app. Chemins verifies contre public/avatars/**.
// A etoffer plus tard si besoin d'un vrai navigateur par categorie.
export const CURATED_AVATARS: string[] = [
  '/avatars/disney/disney_avatar_1.png',
  '/avatars/disney/disney_avatar_2.png',
  '/avatars/disney/disney_avatar_3.png',
  '/avatars/marvel/marvel_avatar_1.png',
  '/avatars/marvel/marvel_avatar_2.png',
  '/avatars/marvel/marvel_avatar_3.png',
  '/avatars/pixar/pixar_avatar_1.png',
  '/avatars/pixar/pixar_avatar_2.png',
  '/avatars/pixar/pixar_avatar_3.png',
  '/avatars/starwars/starwars_avatar_1.png',
  '/avatars/starwars/starwars_avatar_2.png',
  '/avatars/starwars/starwars_avatar_3.png',
  '/avatars/simpsons/simpson_avatar_1.png',
  '/avatars/simpsons/simpson_avatar_2.png',
  '/avatars/simpsons/simpson_avatar_3.png',
  '/avatars/netflix/one_piece/nami.png',
  '/avatars/netflix/one_piece/sanji.png',
  '/avatars/netflix/arcane/jinx.png',
];
