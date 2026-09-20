# Relais Streamed

Main API conserve le catalogue, le contrôle VIP et l'extraction du lecteur
`embed.st`. Le POST d'extraction et les pages intermédiaires Golf passent par
son pool `SOCKS5_PROXIES`, avec rotation partagée via Redis.

Le navigateur reçoit une URL signée de **proxiesembed**, sur `/streamed-proxy`.
Playlists, segments et clés sont téléchargés par le module `streamed_proxy.py`,
avec une session SOCKS5 tirée au hasard dans `PROXIES_SOCKS5_JSON` à chaque
requête amont, redirections comprises. Les téléchargements identiques simultanés
sont mutualisés ; les playlists live ne sont pas mises en cache.

Le relais conserve la variante au débit annoncé le plus élevé. Les variantes
SD/HD Streamed peuvent avoir des horloges MPEG-TS indépendantes : une adaptation
automatique entre elles peut figer la lecture vers 8–12 secondes malgré des
réponses HTTP 200. Le mode extension applique la même sélection dans le frontend.
Les enveloppes PNG/WebP des segments sont retirées avant livraison au lecteur.

## Accès et configuration

- `MEDIA_SIGNING_SECRET` doit être identique dans Main API et proxiesembed.
- Main API expose le relais via `PROXIESEMBED_PUBLIC_URL`, avec le repli existant
  sur l'origine de `IPTV_STREAM_PROXY`.
- `SOCKS5_PROXIES` configure l'extraction dans Main API ;
  `PROXIES_SOCKS5_JSON` configure les téléchargements média dans proxiesembed.
- Sans signature valide : 403 avant tout accès réseau. Sans SOCKS5 : 503,
  sans repli vers la connexion directe.

La signature couvre la route, la cible et l'expiration. Main API borne l'accès à
deux heures et les URLs enfants conservent exactement l'échéance de leur parent.
Le Referer est limité à `https://embed.st/` et `https://exposestrat.com/`.
Les destinations et redirections sont limitées aux CDN Streamed connus.
La résolution DNS vérifie les adresses publiques avant de fournir l'IP au
socket SOCKS5 ; TLS conserve le nom du CDN et vérifie son certificat.

Le frontend utilise le loader HLS natif pour les liens Streamed proxifiés : les
rechargements d'une playlist enfant doivent garder leur URL, même lorsque la
playlist maître ne contient qu'une variante.

## Déploiement et anciens liens

Déployer **proxiesembed avant Main API**, puis le frontend. Les anciens liens
`/api/livetv/streamed/media.m3u8` restent vérifiés par Main API puis redirigés
en 307 vers proxiesembed, sans téléchargement média dans Main API. Une ancienne
URL racine peut renouveler son extraction avant cette redirection.

Les logs `[STREAMED-PROXY]` indiquent l'hôte et le statut amont ou le type
d'erreur, sans URL signée ni identifiant SOCKS5.

## Vérifications ciblées

Depuis la racine du dépôt, sans démarrer les services :

```text
python -m unittest discover -s API/proxiesembed/tests -p test_streamed_proxy.py
node --test API/Mainapi/routes/__tests__/streamedNativeRoutes.test.js tests/streamedPlayback.test.mjs
```

Ces tests couvrent notamment les signatures Node/Python, les accès refusés,
la rotation, les redirections, le DNS, les enveloppes vidéo et l'actualisation
des playlists enfants. Les amonts sont simulés.
