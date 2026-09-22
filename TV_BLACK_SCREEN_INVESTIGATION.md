# MOVIX Google TV — Black Screen Investigation

Authoritative branch: `agent/google-tv-roadmap-v1`  
Historical working baseline: `ff56b3c57511c84cedc89956ba05dedba7630f1d`  
Journal created: 2026-09-22  
Initial remote HEAD at journal creation: `97c62bedba930f0830f461fdca138fc057c48efc`

## Rules

- The original Movix app is treated as working unless an A/B test proves otherwise.
- Never modify `main`.
- Never reset already-pushed branch history.
- One hardware experiment = one runtime variable.
- Separate **FACT / HARDWARE OBSERVATION** from **INTERPRETATION**.
- User hardware observations are authoritative for TV behavior.
- CI success proves build/contracts only; it does not prove Google TV behavior.
- Historical APK SHA-256 values are recorded only when recoverable. Old Android artifacts are deliberately deleted by CI, so unavailable hashes remain explicitly unknown.

## Stable facts before the next test

### FACTS / OBSERVATIONS

1. Baseline `ff56b3c57511c84cedc89956ba05dedba7630f1d` works on the tested Google TV.
2. Baseline-runtime diagnostic `c543106779066d73fe8603efde9315e6a9fd4766` also works on the tested Google TV.
3. When the black-screen bug occurs, the React Native/native navigation bar remains alive. The failure is localized to the WebView/content path rather than the whole Android Activity.
4. D-pad isolation build around `82dd1d13029b4bbfca25887d3c0516aaedff6154` still produced the black screen. Therefore D-pad is not a sufficient cause.
5. `d8c453d4951b1dd850238c911e98571a56c37dae` is the marker-only experiment: runtime is the baseline app runtime plus TV launcher support and `window.MOVIX_TV = true`.
6. `ade4b2cc14045b2e72b74644631153d910265636` adds the TV-only DNS-ready startup wait to the marker-only experiment. It does **not** perform disable→enable VPN restart.
7. User hardware result for `ade4b2cc`, reproduced again after clearing all app data:
   - fresh data / first launch + VPN enable: black;
   - first kill + relaunch: fully functional, including images, search, navigation and video;
   - subsequent kills/relaunches: black.
8. Forced VPN restart experiment `9f9da0e4e01e222843da2cfc3e2e36249ae41887` / successful locked build `ed2c6c683ca2afba0b05758eedce8b3828cc966a` produced black on every launch and altered the native VPN permission/setup sequence. This is a rejected diagnostic experiment, not architecture.
9. Renderer-probe line ending at current HEAD `97c62bedba930f0830f461fdca138fc057c48efc` produced black content while native navigation remained operational, and no diagnostic message was observed by the user.
10. User-Agent at the original baseline and the TV-modified branch was previously verified identical. A simple `navigator.userAgent` TV block is therefore not a leading hypothesis.
11. `src/main.tsx` and `public/sw.js` were previously verified identical to the baseline during this investigation. Direct source modification of the web bootstrap/service-worker is not established.
12. Clearing Android app data resets multiple state stores simultaneously (AsyncStorage, cookies, WebView data, localStorage, IndexedDB, caches/service worker and VPN preference state); that reset alone does not identify VPN as the cause.

### INTERPRETATION / OPEN HYPOTHESES

- The deterministic `black → first-kill success → later black` sequence at `ade4b2cc` is strong evidence that startup timing and/or persistent process/WebView/VPN state participates.
- It does **not** establish which state subsystem is causal.
- `window.MOVIX_TV = true` remains a plausible causal participant because it was present in the `ade4b2cc` sequence and has not yet been removed while holding the rest of that experiment constant.
- D-pad is not excluded as a possible interaction in other builds, but it is excluded as the unique/sufficient cause by the D-pad-disabled hardware result.
- VPN/DNS remains possible, but the forced restart experiment made behavior worse and perturbed Android's native permission lifecycle. No resync/restart should be reintroduced without a new discriminating observation.

---

## Experiment log

### TEST A — D-pad isolation

- TEST ID: TV-BS-A
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: prior TV roadmap state
- TEST COMMIT: `82dd1d13029b4bbfca25887d3c0516aaedff6154`
- APK SHA-256: unknown; historical artifact deleted by cleanup
- WORKFLOW RUN: `35699258114` — success
- HYPOTHESIS: D-pad/MutationObserver runtime is the unique cause.
- VARIABLE UNIQUE MODIFIED: D-pad injection disabled while TV bootstrap remained.
- FILES MODIFIED: runtime change occurred immediately before the locking contract; commit `82dd1d1` locks the state in `app/tests/tvWebViewBootstrapContract.test.mjs`.
- COMPORTEMENT ATTENDU: content should render if D-pad is the unique cause.
- PROTOCOLE MATÉRIEL: install/test on Google TV.
- RÉSULTAT UTILISATEUR: black screen.
- INTERPRÉTATION: D-pad is not a sufficient/unique cause.
- HYPOTHÈSES EXCLUES: “D-pad alone causes all black screens.”
- HYPOTHÈSES ENCORE OUVERTES: WebView startup, injection outside D-pad, TV marker, DNS/VPN timing/state, persistent Chromium/WebView state.
- PROCHAIN TEST RECOMMANDÉ: restore baseline runtime.

### TEST B — Baseline runtime + TV launcher only

- TEST ID: TV-BS-B
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: `ff56b3c57511c84cedc89956ba05dedba7630f1d`
- TEST COMMIT: `c543106779066d73fe8603efde9315e6a9fd4766`
- APK SHA-256: unknown; historical artifact deleted by cleanup
- WORKFLOW RUN: `35700672478` — success
- HYPOTHÈSE: one or more modified app runtime files cause the regression.
- VARIABLE UNIQUE MODIFIÉE: restore baseline versions of `App.tsx`, `WebViewBrowser.tsx`, `BrowserScreen.tsx`, `MirrorErrorScreen.tsx`, `inject.ts`; retain Google TV launcher manifest support.
- FICHIERS MODIFIÉS: the five runtime files above plus diagnostic contract/workflow commits.
- COMPORTEMENT ATTENDU: WebView content renders if original runtime remains healthy.
- PROTOCOLE MATÉRIEL: install/test on Google TV.
- RÉSULTAT UTILISATEUR: PASS; Movix content renders correctly.
- INTERPRÉTATION: original app runtime remains compatible with the tested TV; regression is introduced by our runtime changes.
- HYPOTHÈSES EXCLUES: launcher manifest support alone; inherent incompatibility of the original app with this TV.
- HYPOTHÈSES ENCORE OUVERTES: each subsequently reintroduced runtime change.
- PROCHAIN TEST RECOMMANDÉ: marker-only.

### TEST C — Baseline + `window.MOVIX_TV=true` only

- TEST ID: TV-BS-C
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: `c543106779066d73fe8603efde9315e6a9fd4766`
- RUNTIME CHANGE COMMIT: `e67815fa23c2d8f462b93e61b4df2ed6a5c8c4d0`
- TEST COMMIT: `d8c453d4951b1dd850238c911e98571a56c37dae`
- APK SHA-256: unknown; historical artifact deleted by cleanup
- WORKFLOW RUN: `35702014900` — success
- HYPOTHÈSE: the document-level TV marker participates in the regression.
- VARIABLE UNIQUE MODIFIÉE: add only `window.MOVIX_TV = true` before the baseline injected JS.
- FICHIERS MODIFIÉS: `app/src/components/WebViewBrowser.tsx` plus contract.
- COMPORTEMENT ATTENDU: baseline-like rendering if marker is inert.
- PROTOCOLE MATÉRIEL: fresh install/configure VPN, then kill/relaunch.
- RÉSULTAT UTILISATEUR: first launch showed Movix UI/text but posters were absent; after kill/relaunch the content entered loading/black behavior.
- INTERPRÉTATION: marker is suspicious but this test alone is not enough to establish causality.
- HYPOTHÈSES EXCLUES: none conclusively.
- HYPOTHÈSES ENCORE OUVERTES: marker-dependent web behavior, timing/persistence, WebView state.
- PROCHAIN TEST RECOMMANDÉ: DNS-ready timing while preserving marker-only setup.

### TEST D — Marker-only + TV DNS-ready wait

- TEST ID: TV-BS-D
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: `d8c453d4951b1dd850238c911e98571a56c37dae`
- RUNTIME CHANGE COMMIT: `ead8b1d9538d0cad33e61ceac3eac6920d24388a`
- TEST COMMIT: `ade4b2cc14045b2e72b74644631153d910265636`
- APK SHA-256: unknown; historical artifact deleted by cleanup
- WORKFLOW RUN: `35703475007` — success
- HYPOTHÈSE: WebView mount timing relative to TV VPN/DNS readiness changes the failure.
- VARIABLE UNIQUE MODIFIÉE: TV startup waits for `DnsModule.enable()`, polls `isEnabled()` up to 5 s, waits ~250 ms after readiness; first TV launch waits for permission flow before WebView mount. No forced disable→enable restart.
- FICHIERS MODIFIÉS: `app/src/App.tsx` plus contract.
- COMPORTEMENT ATTENDU: more deterministic healthy first navigation if DNS readiness was the missing condition.
- PROTOCOLE MATÉRIEL: fresh app data; enable VPN; observe first launch; kill/relaunch repeatedly; repeat after clearing all app data.
- RÉSULTAT UTILISATEUR: deterministic sequence reproduced twice: `black → kill → perfect → kill → black → black...`.
- INTERPRÉTATION: a narrow post-first-kill state supports fully correct operation for one process launch. State/timing is implicated, but exact subsystem remains unknown.
- HYPOTHÈSES EXCLUES: permanent network/domain incompatibility; permanent renderer incapacity on TV.
- HYPOTHÈSES ENCORE OUVERTES: MOVIX_TV marker interaction, WebView/Chromium persisted state, VPN/DNS state, startup race, cache/service-worker state.
- PROCHAIN TEST RECOMMANDÉ: reproduce this exact runtime **without MOVIX_TV marker**.

### TEST E — Forced VPN restart

- TEST ID: TV-BS-E
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: `ade4b2cc14045b2e72b74644631153d910265636`
- RUNTIME CHANGE COMMIT: `9f9da0e4e01e222843da2cfc3e2e36249ae41887`
- TEST COMMIT: `ed2c6c683ca2afba0b05758eedce8b3828cc966a`
- APK SHA-256: unknown; historical artifact deleted by cleanup
- WORKFLOW RUNS: `35705869030` cancelled at runtime-change commit; `35706137232` success at locked test commit.
- HYPOTHÈSE: sticky VPN/DNS state requires a clean disable→enable cycle every TV launch.
- VARIABLE UNIQUE MODIFIÉE: forced disable/wait-off/enable/wait-on + longer grace.
- FICHIERS MODIFIÉS: `app/src/App.tsx` plus contract.
- COMPORTEMENT ATTENDU: reproduce the healthy second-launch state consistently.
- PROTOCOLE MATÉRIEL: fresh install/permission flow and repeated launches.
- RÉSULTAT UTILISATEUR: black at all launches; native VPN setup/permission sequence also changed (only one of the normally observed two setup steps appeared in this test).
- INTERPRÉTATION: forced restart does not reproduce the good state and perturbs the Android VPN lifecycle.
- HYPOTHÈSES EXCLUES: “blindly restarting VPN every launch is a valid fix.”
- HYPOTHÈSES ENCORE OUVERTES: original DNS wait, marker, WebView/persistent state.
- PROCHAIN TEST RECOMMANDÉ: remove forced restart; do not preserve it as architecture.

### TEST F — Renderer observation line

- TEST ID: TV-BS-F
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT: diagnostic restoration series after TEST E
- TEST COMMIT: `97c62bedba930f0830f461fdca138fc057c48efc`
- APK SHA-256: not yet recovered in this journal revision; current artifact still existed at journal creation
- WORKFLOW RUN: `35708523606` — success
- HYPOTHÈSE: an observation-only probe can report document/renderer state without altering site behavior.
- VARIABLE UNIQUE MODIFIÉE: TV-specific product behavior gated off; render probe retained.
- FICHIERS MODIFIÉS: diagnostic chain includes app runtime files, `tv-render-diagnostic.ts`, `tvRuntimePolicy.ts`, contract.
- COMPORTEMENT ATTENDU: diagnostic message exposing readyState/root/SW/error state.
- PROTOCOLE MATÉRIEL: run on TV and observe native diagnostic surface.
- RÉSULTAT UTILISATEUR: WebView black; native navigation alive; no diagnostic message observed.
- INTERPRÉTATION: document did not reach the expected observable communication path, or the probe/bridge path did not execute/communicate. This is not by itself proof of Chromium renderer crash.
- HYPOTHÈSES EXCLUES: none absolutely.
- HYPOTHÈSES ENCORE OUVERTES: navigation not reaching document start, renderer/navigation failure, injection/bridge failure, WebView state, network transition.
- PROCHAIN TEST RECOMMANDÉ: return to the strongest reproducible state TEST D and remove only MOVIX_TV.

---

## Next A/B — TV-BS-G

- BASELINE: `ade4b2cc14045b2e72b74644631153d910265636`
- HYPOTHESIS: `window.MOVIX_TV = true` is necessary for the TEST D black→perfect→black sequence.
- UNIQUE RUNTIME VARIABLE: remove `window.MOVIX_TV = true`.
- KEEP EXACTLY FROM TEST D:
  - `App.tsx` TV DNS-ready wait;
  - first-launch wait for VPN permission/setup before mounting WebView;
  - no forced VPN restart;
  - baseline `BrowserScreen.tsx`;
  - baseline `MirrorErrorScreen.tsx`;
  - baseline `inject.ts`;
  - baseline WebView behavior otherwise;
  - Google TV launcher manifest support.
- DO NOT ADD: renderer probe, TV CSS, D-pad, MutationObserver, Back TV, retry TV, popup changes, cache/SW clearing, VPN disable→enable resync.
- HARDWARE PROTOCOL:
  1. Clear all application data.
  2. Launch app and accept/complete the normal VPN permission/setup flow.
  3. Record first-launch result.
  4. Kill the app completely and relaunch once; record result.
  5. Repeat kill/relaunch at least three additional times.
  6. Record whether the TEST D sequence `black → perfect → black...` is preserved, disappears, or changes.
- DISCRIMINATION:
  - If sequence disappears materially: MOVIX_TV participates causally.
  - If sequence remains materially the same: MOVIX_TV is not necessary; focus shifts to WebView/VPN/persistence/timing.

---

## Recent branch chronology (30 commits from remote HEAD at journal creation)

```text
01 97c62bedba930f0830f461fdca138fc057c48efc test(tv): lock phone-safe renderer diagnostic
02 9c4c72baa96d553b94770beffe8e3d08c83ce0f7 diag(tv): observe renderer with TV product code disabled
03 0f9eb6a7428f70762021f9442afa07e6c020bd72 diag(tv): disable only TV back and retry behavior
04 599a30f0c806b699b3685036bd08aba7959c8a39 diag(tv): gate only TV-specific product behavior
05 61ae3d692a310ffe21eaad9212dd495cc26a36a9 diag(tv): restore phone-validated injection/inject.ts
06 56c56ed28d0f1464936b41247707c32b7f9408a0 diag(tv): restore phone-validated components/MirrorErrorScreen.tsx
07 001e87e31250f1c0c6bd074ba4ab904978ef3605 diag(tv): restore phone-validated screens/BrowserScreen.tsx
08 b157e0b4c39743522b5ba4a55238b88e0053d4ce diag(tv): restore phone-validated components/WebViewBrowser.tsx
09 a8f6b67857fc50db2ae42a9fb272a0739237301f diag(tv): restore phone-validated App.tsx
10 743b0fa1197eb4098eef09f15a0698bd22c30cbf test(tv): lock observation-only renderer diagnostic
11 a24e2d26d6588309fe19e153d2054d08db6f58ab fix(diag): keep original URL effect and scope TV probe
12 fc7031b8d962a20fdd28e6e8f43c2b5fe197b826 diag(tv): report renderer state without changing site behavior
13 ba15fa1dd0ab4f24e90ecadf85e0aef08b37ad7a diag(tv): add non-destructive render probe
14 87437de527122583adef570469edc6b3aff299f2 diag(tv): restore original WebView behavior
15 69854c246dbf79e68dda41c9a73e912307e8ad84 diag(tv): restore original VPN startup lifecycle
16 ed2c6c683ca2afba0b05758eedce8b3828cc966a test(tv): fix handheld-path contract matcher
17 3685170f3225c85c9cfa28d809234ca0d2d38c97 test(tv): lock clean DNS restart lifecycle
18 9f9da0e4e01e222843da2cfc3e2e36249ae41887 fix(tv): rebuild DNS tunnel on every TV launch
19 ade4b2cc14045b2e72b74644631153d910265636 test(tv): cover DNS-ready marker-only diagnostic
20 ead8b1d9538d0cad33e61ceac3eac6920d24388a diag(tv): wait for DNS forwarding before TV startup
21 d8c453d4951b1dd850238c911e98571a56c37dae test(tv): lock marker-only diagnostic runtime
22 e67815fa23c2d8f462b93e61b4df2ed6a5c8c4d0 diag(tv): inject only MOVIX_TV marker
23 c543106779066d73fe8603efde9315e6a9fd4766 ci(tv): build baseline-runtime diagnostic APK
24 efe0bdf150c22e5a5f21be0a5485795b118b74a7 test(tv): assert baseline runtime diagnostic build
25 ed133eaae80f765dbe6f7b756c11e4c799d09191 diag(tv): restore baseline injection/inject.ts
26 82b204f3b352d1d30dda83c0e9053099bf7fd58a diag(tv): restore baseline components/MirrorErrorScreen.tsx
27 a32e60716a6cf9e5b479ee22fa1fbc163619bfc0 diag(tv): restore baseline screens/BrowserScreen.tsx
28 55c96dd0e34e5428987b515eea997eab6fd32f39 diag(tv): restore baseline components/WebViewBrowser.tsx
29 aff146cf1e0b20dd62af638cb645edd5a40d69b9 diag(tv): restore baseline App.tsx
30 82dd1d13029b4bbfca25887d3c0516aaedff6154 test(tv): lock D-pad isolation build contract
```


---

## TV-BS-G build record — READY FOR HARDWARE TEST

- TEST ID: TV-BS-G
- DATE: 2026-09-22
- BRANCH: `agent/google-tv-roadmap-v1`
- BASE COMMIT FOR SCIENTIFIC A/B: `ade4b2cc14045b2e72b74644631153d910265636`
- JOURNAL CHECKPOINT BEFORE RUNTIME CHANGE: `18feefb4c3be2504f3e7791584d98d8bf1d04946`
- TEST RUNTIME COMMIT: `29ffab4ee454c4e18bfb6bcfa24ac6aefbe5f67f`
- WORKFLOW RUN: `35712651080` — SUCCESS
- ARTIFACT ID: `10687510792`
- ARTIFACT NAME: `movix-google-tv-standalone-apk`
- APK SIZE: `72594150` bytes
- APK SHA-256: `dad600b805ed64a91e008d675af6425a6f58ae19016d620e03ddfae79c0957f9`
- HYPOTHÈSE: `window.MOVIX_TV = true` is necessary for the TEST D sequence `black → first kill perfect → later black`.
- VARIABLE UNIQUE MODIFIÉE: remove the MOVIX_TV marker while preserving TEST D DNS-ready timing.
- EXACT RUNTIME BLOBS VERIFIED BY CI:
  - `app/src/App.tsx` = `ca2ef5ccbbbe8b9282d935e59235ceee000ce2b1` — exact TEST D blob.
  - `app/src/components/WebViewBrowser.tsx` = `c42d8b9e33dd01af93ddadbf9f89ba432255784a` — exact hardware-PASS baseline-runtime blob.
  - `app/src/screens/BrowserScreen.tsx` = `e7a7aae7f7754c49880b166006debff6b25efdbb`.
  - `app/src/components/MirrorErrorScreen.tsx` = `39854aee4c3fda0915629de455059f61486c557e`.
  - `app/src/injection/inject.ts` = `4df61dd53d5bd8d9cb30368905aa20aac261d142`.
- CI VALIDATION:
  - A/B blob contract: PASS.
  - TypeScript: PASS.
  - frontend production build: PASS.
  - Android standalone release build: PASS.
  - merged TV/mobile manifest contract: PASS.
  - standalone JS bundle packaged: PASS.
  - old Android artifact cleanup: PASS.
  - APK upload: PASS.
- COMPORTEMENT ATTENDU: this test distinguishes whether MOVIX_TV is necessary for the TEST D launch sequence.
- PROTOCOLE MATÉRIEL:
  1. Clear **all application data** so the starting condition matches TEST D.
  2. Install/launch this APK.
  3. Complete the normal VPN permission/setup flow; do not manually resync or restart the VPN.
  4. Record first-launch WebView result.
  5. Kill the app completely; relaunch; record result.
  6. Repeat complete kill/relaunch at least three more times, recording each launch.
  7. Report images/search/video behavior if any launch renders.
- RÉSULTAT UTILISATEUR: **PENDING — no hardware conclusion before user test.**
- INTERPRÉTATION: **PENDING.**
- HYPOTHÈSES EXCLUES: none additionally until hardware result exists.
- HYPOTHÈSES ENCORE OUVERTES: MOVIX_TV marker, WebView/Chromium persisted state, VPN/DNS state, startup race, cache/service-worker state.
- PROCHAIN TEST RECOMMANDÉ: **do not choose until TV-BS-G hardware result is recorded.**


---

## TV-BS-G hardware result — BLACK / VPN CONSENT STATE DIFFERENT

- TEST ID: TV-BS-G
- DATE OF HARDWARE RESULT: 2026-09-22
- TEST RUNTIME COMMIT: `29ffab4ee454c4e18bfb6bcfa24ac6aefbe5f67f`
- APK SHA-256: `dad600b805ed64a91e008d675af6425a6f58ae19016d620e03ddfae79c0957f9`
- USER HARDWARE RESULT:
  - WebView content black on every tested launch.
  - Native navigation bar remained functional, as in previous failures.
  - On the first launch, only the first in-app Cloudflare prompt appeared.
  - The second Android system VPN authorization prompt ("Movix souhaite changer la configuration réseau") did **not** appear.
- FACT:
  - `DnsModule.enable()` calls Android `VpnService.prepare(activity)`.
  - If `VpnService.prepare()` returns a non-null Intent, Android shows the system VPN authorization UI.
  - If it returns null, the app is already considered prepared/previously consented and the code starts `DnsVpnService` immediately.
- IMPORTANT INTERPRETATION:
  - TV-BS-G did successfully remove `window.MOVIX_TV`, but its OS-level VPN authorization starting state did **not** match the fresh-consent state observed in TEST D.
  - Therefore TV-BS-G's all-black result does **not** cleanly falsify the MOVIX_TV hypothesis yet; the A/B is confounded by a different Android VPN consent state.
  - Clearing application data is not sufficient evidence that Android's system VPN consent has been revoked.
- ADDRESS-BAR HYPOTHESIS:
  - TV-BS-G uses the exact `BrowserScreen.tsx` and `WebViewBrowser.tsx` blobs from hardware-PASS TEST B / `c543106`.
  - Therefore the later forced-hidden address-bar/UI change is absent from this APK and cannot explain TV-BS-G directly.
- NEXT TEST RECOMMENDED:
  - **Do not build another APK yet.**
  - Reuse the exact TV-BS-G APK.
  - Explicitly revoke/disconnect Movix's Android VPN authorization/state at OS level until the second Android VPN authorization prompt is guaranteed to reappear.
  - Clear all Movix app data after that.
  - Relaunch the same TV-BS-G APK and repeat the launch sequence.
  - This changes only the OS-level VPN authorization precondition while keeping the APK byte-identical.
- RESULT STATUS: hardware result recorded; MOVIX_TV causality remains unresolved because of the VPN-consent confound.


---

## TV-BS-G hardware follow-up — VPN DISCONNECTED => APP WORKS

- DATE OF HARDWARE RESULT: 2026-09-22
- APK UNDER TEST: exact same TV-BS-G APK
- TEST RUNTIME COMMIT: `29ffab4ee454c4e18bfb6bcfa24ac6aefbe5f67f`
- APK SHA-256: `dad600b805ed64a91e008d675af6425a6f58ae19016d620e03ddfae79c0957f9`
- USER HARDWARE OBSERVATION:
  - With the Movix/Cloudflare VPN active, WebView content is black while the native navigation bar remains alive.
  - After disconnecting the VPN at Android/Google TV system level, the application works and Movix content renders.
- FACTUAL IMPORTANCE:
  - No APK rebuild occurred between failure and success.
  - No WebView/product-code change occurred between failure and success.
  - The observed variable changed was the VPN connection state.
- INTERPRETATION:
  - This is the strongest evidence so far that the black-screen regression is in, or is triggered by, the Android DNS VPN path rather than the address bar, D-pad, MOVIX_TV marker, or baseline WebView rendering itself.
  - This does not yet identify the exact defect inside the VPN path (permission lifecycle, TUN establishment, DNS forwarding, routing, startup race, stale service, packet handling, or interaction with Android WebView networking).
- ADDRESS-BAR STATUS:
  - Effectively excluded as direct cause for this failure: the same APK renders when VPN is disconnected.
- NEXT MINIMAL CONFIRMATION:
  - Keep the APK byte-identical.
  - Toggle only VPN state on the same installation and observe whether the result follows the VPN state reproducibly:
    1. VPN OFF -> verify Movix renders.
    2. VPN ON -> verify whether content turns/stays black after a clean app relaunch.
    3. VPN OFF -> verify rendering returns after a clean app relaunch.
  - If OFF=works / ON=black / OFF=works reproduces, treat VPN path as causally demonstrated at the system level and move to isolating the specific VPN implementation defect.


---

## TV-BS-G hardware follow-up — VPN REQUIRED FOR INITIAL PATH, BUT RETRY LOADS WITHOUT VPN

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: exact same TV-BS-G APK
- TEST RUNTIME COMMIT: `29ffab4ee454c4e18bfb6bcfa24ac6aefbe5f67f`
- APK SHA-256: `dad600b805ed64a91e008d675af6425a6f58ae19016d620e03ddfae79c0957f9`
- USER HARDWARE OBSERVATION:
  1. Kill/relaunch Movix.
  2. Movix VPN starts automatically.
  3. User disables the VPN from Android system settings.
  4. App shows the normal Movix-unavailable fallback screen.
  5. User presses the fallback refresh/retry action.
  6. Movix then loads correctly while the VPN remains OFF.
- RELATED HISTORICAL OBSERVATION:
  - This resembles the earlier TEST D behavior where one launch after the first kill rendered perfectly before later launches returned to black.
- INTERPRETATION:
  - The VPN/DNS path appears necessary for at least part of the initial resolution/bootstrap path, but a continuously active VPN is not necessary for the already-resolved/retried WebView session to render Movix.
  - This strongly suggests separating:
    A. bootstrap/domain resolution/discovery,
    B. steady-state WebView traffic.
  - A plausible failure mode is that the local DNS VPN is useful for A but harmful to B on Google TV.
  - This is not yet proven to be DNS-cache reuse specifically; retry behavior, hostname/address selection, WebView network-process state, or a cached redirect can produce the same observation.
- NEXT CODE ANALYSIS:
  - Inspect fallback/retry implementation and address-resolution flow to determine what state changes between first load and retry.
  - Compare TV and handheld paths for WebView/network initialization and Android VPN behavior before designing the next one-variable APK.


---

## Code-level narrowing — native VPN unchanged; TV-only startup sequencing differs

- DATE: 2026-09-22
- VERIFIED GIT BLOBS:
  - `app/android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt`
    - baseline `ff56b3c5`: `70f6c6539a0ae0033bfd4aa10e2fa439385fb747`
    - hardware-PASS `c5431067`: same blob
    - TV-BS-G `29ffab4e`: same blob
  - `app/android/app/src/main/java/com/movix/app/dns/DnsModule.kt`
    - baseline `ff56b3c5`: `0a4dfcda8717826b6d68eff4ed2295fa5f12fb92`
    - hardware-PASS `c5431067`: same blob
    - TV-BS-G `29ffab4e`: same blob
- FACT:
  - The native VPN/DNS implementation itself did not change between original baseline, known-good TV baseline-runtime build, and TV-BS-G.
  - Native VPN routes only `1.1.1.1/32` and `1.0.0.1/32`; it is a DNS-only TUN path, not a full-traffic VPN.
- KEY DIFFERENCE:
  - Baseline / phone path does NOT wait for the DNS VPN permission/activation before mounting the React Native/WebView application. On first run it calls `promptDns()`, marks DNS settled, and continues startup immediately.
  - TV-BS-G contains a TV-only branch: `isAndroidTvRuntime()` -> `await promptDnsForTv()` -> `DnsModule.enable()` -> `await waitForTvDnsReady()` (+ 250 ms grace) -> only then `setReady(true)` and mount WebView.
  - On handheld Android, this TV-only blocking path is not used, which directly explains why the phone can remain unaffected.
- STRONG WORKING HYPOTHESIS:
  - The regression is caused by WebView/network-process initialization occurring *after* the DNS-only VPN/TUN has already been established on Google TV.
  - The original/phone behavior initializes WebView while VPN activation is still asynchronous; later VPN establishment does not produce the same failure.
  - Hardware sequence "VPN on -> black; disable VPN -> fallback; retry -> Movix works without VPN" is compatible with DNS being needed for initial host discovery/resolution while an already-established DNS-only TUN interferes with the first WebView network initialization.
- IMPORTANT NATIVE DETAIL TO INSTRUMENT LATER IF NEEDED:
  - `forwardDnsQuery()` calls `protect(socket)` but ignores its Boolean return value.
  - Android documentation states that a tunnel/upstream socket covered by VPN routes must be protected or its traffic can loop back into the VPN; `protect()` can fail if the VPN is not prepared or has been revoked.
  - This is a secondary native hypothesis only; because the same native blobs work in the known-good build, startup ordering should be tested first.
- NEXT CLEAN A/B:
  - Start from TV-BS-G.
  - Change only `app/src/App.tsx` back to the exact known-good `c543106`/baseline behavior (remove TV-only blocking DNS wait).
  - Keep WebViewBrowser, BrowserScreen, MirrorErrorScreen, injection, native VPN code, launcher manifest, and all other runtime variables unchanged.
  - Expected discriminator: if TV returns to stable rendering with VPN enabled, the TV-only DNS-before-WebView sequencing is the causal regression.
