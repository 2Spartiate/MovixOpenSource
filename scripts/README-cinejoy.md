# Cinejoy → VLC ou navigateur Vidstack depuis un ID TMDB

Script autonome pour Python 3.10+ ; il ne nécessite ni clé TMDB, ni Node.js,
ni le démarrage de Movix. Installer VLC séparément pour le mode VLC.
Conserver `cinejoy_player.html` à côté du script pour le mode navigateur.

Depuis la racine du dépôt :

```powershell
python -m pip install -r scripts/requirements-cinejoy.txt
python scripts/cinejoy_vlc.py
```

Le script demande l'ID TMDB, le type film/série, puis la saison et l'épisode
pour une série. Il affiche les flux disponibles, propose d'en sélectionner
un et demande **« Ouvrir avec [vlc/navigateur/non] »**. Entrée vaut **non** ;
`oui` reste accepté comme raccourci pour VLC.

Exemples :

```powershell
# Film : affiche les flux et demande si tu veux ouvrir VLC
python scripts/cinejoy_vlc.py 550

# Série, saison 1, épisode 2
python scripts/cinejoy_vlc.py 125988 --type tv --saison 1 --episode 2

# Ouvre le lecteur Vidstack avec les sources HLS disponibles
python scripts/cinejoy_vlc.py 550 --navigateur

# Série dans le navigateur, avec un seul serveur
python scripts/cinejoy_vlc.py 125988 --type tv --saison 1 --episode 2 --serveur Lisbon --navigateur

# Extraction uniquement, sans démarrer VLC ni le relais
python scripts/cinejoy_vlc.py 550 --serveur Lisbon --non

# Ouvre directement le premier flux du serveur choisi
python scripts/cinejoy_vlc.py 550 --serveur Lisbon --flux 1 --oui

# Chemin VLC personnalisé, notamment pour une installation portable
python scripts/cinejoy_vlc.py 550 --vlc "D:\Applications\VLC\vlc.exe"
```

Avec un ID passé en argument, le type par défaut est `movie`. `--type tv`
utilise la saison 1 et l'épisode 1 par défaut. `--saison 0` sélectionne les
épisodes spéciaux. Donner `--saison` ou `--episode` implique `tv` si `--type`
est omis. `--help` liste les options ; `--timeout 30` augmente le délai réseau.

La détection de VLC cherche dans le PATH, les répertoires habituels Windows
et `/Applications/VLC.app/Contents/MacOS/VLC` sur macOS.

## Lecture et en-têtes

Quand tu choisis **VLC** ou **navigateur**, le script démarre un relais sur
`127.0.0.1` avec un port libre et une adresse aléatoire propre à cette lecture.
Le relais ajoute `Referer`, `Origin` et `User-Agent` aux requêtes distantes.
Il réécrit les manifestes HLS pour que les variantes, pistes audio, sous-titres,
clés et segments passent eux aussi par le relais. Les requêtes `Range` des
fichiers MP4/MKV sont conservées pour permettre de changer de position.
Les sous-titres intégrés au manifeste sont transmis. Les pistes externes du
champ `captions` sont ajoutées au lecteur Vidstack, mais pas automatiquement à VLC.

**Garde le terminal ouvert pendant la lecture.** Fermer VLC arrête le relais ;
Ctrl+C arrête le relais sans fermer les autres fenêtres VLC.
En mode navigateur, fermer l'onglet laisse le script actif : utilise Ctrl+C
dans le terminal pour arrêter le relais.

## Lecteur navigateur

`--navigateur` (alias `--browser`) ouvre le navigateur par défaut. Le terminal
affiche aussi l'adresse locale, à ouvrir manuellement si nécessaire. Aucune
installation de VLC n'est nécessaire pour ce mode. Vidstack 1.15.4 et ses
styles sont chargés depuis jsDelivr ; une connexion à ce CDN est nécessaire.

- **Sources HLS uniquement** : un sélecteur permet de changer de serveur sans
  refaire l'extraction. `--flux N` définit la source initiale parmi les sources
  HLS affichées avec `--navigateur`. Les sources fichiers (MP4, MKV, etc.) sont
  exclues du navigateur et restent disponibles dans VLC.
- **HLS** : le menu **Réglages → Qualité** propose le mode automatique et les
  résolutions réellement présentes dans le manifeste.
- **Reprise** : changer de source conserve la
  position, la vitesse, le volume et l'état lecture/pause après chargement.
- **Pistes et contrôles** : pistes audio HLS, sous-titres intégrés ou externes
  (VTT, SRT, ASS/SSA et JSON), vitesse, volume, plein écran et incrustation
  selon les capacités du navigateur. Les contrôles Vidstack sont traduits en français.

Le navigateur doit prendre en charge les codecs du flux HLS. Certaines sources
fichiers annoncées comme MP4 contiennent en réalité du MKV avec un son E-AC-3,
qui peut rester muet dans le navigateur. Elles sont donc réservées à VLC.
Aucune conversion audio ou vidéo n'est effectuée. Si aucun HLS n'est disponible,
le script indique d'utiliser VLC. La diffusion Cast/AirPlay est masquée
car l'adresse locale du relais n'est pas accessible à un autre appareil.

**Non** affiche seulement l'URL distante et les en-têtes. Coller cette URL
seule dans VLC peut échouer si la source exige ces en-têtes ; relance avec
`--oui` ou `--navigateur` pour utiliser le relais. Les liens peuvent expirer : réextrais-les
au moment de la lecture. Une qualité `auto` signifie que la résolution dépend
du manifeste ; le script n'invente pas une résolution à partir du serveur.

## Source et maintenance

Inspiré de l'[extracteur Cinejoy de Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers/blob/06d95c4d38fd534e2c31b416b6ad9614579e3c03/providers/extractors/cinejoy.ts).
Le script reprend la découverte des serveurs, les sources HLS/fichier et les
liens complémentaires de `downloads.shegu.st`.

Le chunk `DsIc7hoQ.js` du code d'origine renvoyait 404 lors de l'adaptation
du 12 septembre 2026. Cette version utilise le protocole actuel
`lumen-gate-v2` : `api.shegu.st/crush.wasm`, POST `/g`, réponse AES-GCM.
Le module WASM est téléchargé à chaque lancement pour suivre ses mises à jour,
exécuté par Wasmtime sans imports ni accès au système, avec mémoire et calcul
limités. Le processus Python n'exécute aucun JavaScript distant. Le lecteur
navigateur utilise la [distribution officielle Vidstack](https://vidstack.io/docs/player/getting-started/installation/cdn/).
Un changement de protocole
peut nécessiter une nouvelle adaptation. Certains serveurs peuvent ne pas
proposer le titre demandé ou renvoyer uniquement un embed non pris en charge.

Vérifications locales, sans accès réseau ni lancement de VLC :

```powershell
python -m unittest discover -s tests -p test_cinejoy_vlc.py
```
