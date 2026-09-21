# Movix Google TV — Session 1 foundation validation

Checkpoint G — clôture documentaire de la Session 1.

## Références

- Dépôt : `2Spartiate/MovixOpenSource`
- Branche : `agent/google-tv-roadmap-v1`
- Base historique : `main@ff56b3c57511c84cedc89956ba05dedba7630f1d`
- HEAD initial Session 1 : `fbe2271b1b79bacbdefb60800b87820bc344728c`
- HEAD avant clôture : `96b88865954ddf1dd3b8ef109d675c90fe586821`
- Upstream `movixcorp/MovixOpenSource` : lecture seule.

## Checkpoints A → G

| Checkpoint | Statut | SHA | Résumé |
|---|---|---|---|
| A | PASS | `6fe6a0bbc1a67600f1170834a9016da25777abb7` | Audit Android/WebView/frontend/players/workflows. |
| B | PASS | `d9590e8dec5abcf6ef83bff40bbdb0f6c8f8c6cd` | Cartographie focus, D-pad, Arrow keys, hover et players. |
| C | PASS | `c1a3592f8fbb3ccbc3afa8067272e762dbbe3290` | Architecture TV retenue et frontières de responsabilité. |
| D | PASS | `68f2ce3a0533dec81d71f3a6a3650198993c71da` | Launcher Google TV, manifest leanback/touchscreen optionnels et bannière technique. |
| E | PASS | `8dc5f11af1c7dd37f259a2b937af61b0f30096f1` | Détection Android TV fondée sur `Platform.isTV`. |
| F | PASS | `131e849eee835276e6d407f46343215f6edb6724` | Bootstrap WebView TV-only, marqueurs DOM et cache TV/mobile séparé. |
| G | PASS | présent commit | Validation CI finale et clôture documentaire de Session 1. |

Le SHA de G est nécessairement celui du commit qui introduit ce rapport ; il ne peut pas être auto-référencé dans son propre contenu Git.

## Fichiers principaux modifiés

- `docs/tv/TV_BASELINE_AUDIT.md`
- `docs/tv/TV_FOCUS_KEYBOARD_MAP.md`
- `docs/tv/TV_ARCHITECTURE.md`
- `docs/tv/TV_ANDROID_MANIFEST.md`
- `app/android/app/src/main/AndroidManifest.xml`
- `app/android/app/src/main/res/drawable-xhdpi/tv_banner.xml`
- `app/src/platform/tvRuntime.ts`
- `app/src/platform/tvRuntimePolicy.ts`
- `app/src/screens/BrowserScreen.tsx`
- `app/src/components/WebViewBrowser.tsx`
- `app/src/injection/inject.ts`
- `app/src/injection/tv-bootstrap.ts`
- `app/tests/tvRuntimeContract.test.mjs`
- `app/tests/tvWebViewBootstrapContract.test.mjs`
- `.github/workflows/android-tv-foundations.yml`

## Architecture TV retenue

La source de vérité TV reste native/RN : `Platform.isTV`, sans heuristique de taille d'écran ni user-agent. `BrowserScreen` propage explicitement `isTV` vers `WebViewBrowser`, qui construit une injection distincte TV/mobile. En mode TV seulement, le bootstrap pose `window.MOVIX_TV = true`, ajoute la classe racine `movix-tv` et un style minimal de focus visible. Le frontend général, le userscript métier, les players, les providers, Cast, PiP, DNS et l'updater restent inchangés à ce stade.

Le manifest reste commun téléphone + TV : leanback et touchscreen sont déclarés non obligatoires, le launcher téléphone reste présent et un launcher Leanback est ajouté.

## Tests et CI

Workflow : **Android TV foundations**  
Run vérifié : **35641303926**  
Job : **Contracts and Android debug build**  
Conclusion finale : **success**.

Étapes confirmées PASS :

- setup job ;
- checkout ;
- setup Node ;
- `npm ci` ;
- `npm run build:userscript` ;
- tests TV runtime/bootstrap ;
- `npx tsc --noEmit` ;
- `:app:processDebugMainManifest` ;
- `:app:assembleDebug` ;
- assertions du merged manifest TV + mobile ;
- post-job setup-node ;
- post-job checkout ;
- complete job.

Le correctif d'ordre CI `96b88865954ddf1dd3b8ef109d675c90fe586821` garantit que le userscript généré est reconstruit avant la validation TypeScript/contrats.

Aucun warning bloquant n'est remonté dans l'état final du job. Les étapes post-job sont elles aussi terminées avec succès.

## Portée exacte de la validation

Validé automatiquement :

- contrats de détection TV ;
- propagation RN → WebView ;
- bootstrap TV-only ;
- séparation du cache d'injection TV/mobile ;
- génération userscript ;
- TypeScript ;
- merged Android manifest ;
- build Android debug.

Non validé matériellement :

- navigation réelle à la télécommande ;
- comportement sur un téléviseur / Google TV physique ;
- ergonomie finale du focus ;
- players au D-pad ;
- iframes cross-origin ;
- bannière marketing finale.

Aucun APK n'a été publié par cette clôture et aucun smoke-test matériel n'a été déclaré.

## Limitations connues

- Le bootstrap F ne contient volontairement encore aucun moteur spatial ni interception Arrow.
- Les handlers Arrow déjà présents dans certains players/pages restent des conflits à traiter par garde TV ciblée.
- Les contrôles hover-only doivent recevoir des équivalents focus TV.
- La bannière actuelle est une ressource technique de launcher, pas un asset marketing final.
- Les players tiers cross-origin resteront opaques sans coopération de leur provider.

## Prochaine étape

**Session 2 : moteur spatial D-pad TV-only**, en commençant par un cœur algorithmique pur et testable avant découverte DOM, interception clavier, header et carrousels.
