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


---

## TV-BS-H — exact baseline DNS/WebView startup ordering

- TEST ID: TV-BS-H
- DATE: 2026-09-22
- PURPOSE:
  - Test whether the TV-only blocking sequence "VPN ready before WebView mount" is the causal regression.
- UNIQUE RUNTIME VARIABLE VS TV-BS-G:
  - `app/src/App.tsx` restored exactly to the hardware-PASS `c543106` / original baseline behavior.
  - Removed TV-only `isAndroidTvRuntime()` DNS startup branch, `promptDnsForTv()`, `waitForTvDnsReady()`, and the 250 ms post-ready grace.
  - First-run DNS prompt is again asynchronous and does not block WebView startup, exactly like the original app and handheld Android path.
- FROZEN RUNTIME ANCHORS:
  - `App.tsx`: `5fbe28710abf29ed78a478e1ca6bdf364f82b71a`
  - `WebViewBrowser.tsx`: `c42d8b9e33dd01af93ddadbf9f89ba432255784a`
  - `BrowserScreen.tsx`: `e7a7aae7f7754c49880b166006debff6b25efdbb`
  - `MirrorErrorScreen.tsx`: `39854aee4c3fda0915629de455059f61486c557e`
  - `inject.ts`: `4df61dd53d5bd8d9cb30368905aa20aac261d142`
  - native `DnsModule.kt`: `0a4dfcda8717826b6d68eff4ed2295fa5f12fb92`
  - native `DnsVpnService.kt`: `70f6c6539a0ae0033bfd4aa10e2fa439385fb747`
- TEST COMMIT / APK SOURCE COMMIT:
  - `6dbd88159e725add934eb4595f226dea5378eda5`
  - message: `diag(tv): restore baseline DNS/WebView startup ordering`
- CI:
  - workflow: Android TV foundations
  - run ID: `35722118740`
  - conclusion: PASS
  - A/B diagnostic contract: PASS
  - frontend production build: PASS
  - standalone Android APK: PASS
  - merged TV/mobile manifest contract: PASS
  - standalone JS bundle packaged: PASS
- GITHUB ARTIFACT:
  - ID: `10692326949`
  - name: `movix-google-tv-standalone-apk`
  - artifact ZIP digest: `sha256:2eb1b473399bc1c8e0c2c971d46d25c46aa13cd82adfb9defe829f6cdce58ea7`
- APK:
  - file: `app-release.apk`
  - size: `72,593,302 bytes`
  - SHA-256: `1ff14effc12f1b83cbf5036eb4d171918b5c55ce4812c013ee8d904a0e6f2f1a`
- HARDWARE PROTOCOL:
  1. Install TV-BS-H.
  2. Keep the normal Movix DNS/VPN feature enabled; do not manually force a VPN restart/resync.
  3. On a fresh first launch, record whether both expected prompts appear if Android requires VPN consent.
  4. Record whether Movix renders on the first launch.
  5. Perform at least three complete kill/relaunch cycles with VPN enabled and record each result.
  6. If fallback appears, record exactly what preceded it; do not change VPN state before recording.
  7. Test basic images/search/video only if the page renders.
- EXPECTED DISCRIMINATOR:
  - Stable rendering with VPN enabled strongly identifies the removed TV-only DNS-before-WebView sequencing as the causal regression.
  - Continued black screen means startup ordering alone is insufficient and the next test must isolate another VPN/WebView interaction without changing native VPN code gratuitously.
- USER HARDWARE RESULT: **PENDING**


---

## TV-BS-H hardware result — sequence persists with exact baseline startup ordering

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: TV-BS-H
- APK SOURCE COMMIT: `6dbd88159e725add934eb4595f226dea5378eda5`
- APK SHA-256: `1ff14effc12f1b83cbf5036eb4d171918b5c55ce4812c013ee8d904a0e6f2f1a`
- USER HARDWARE OBSERVATION:
  1. First launch: Movix renders, but images/posters are missing.
  2. After first complete kill/relaunch: Movix renders correctly, including images.
  3. After second complete kill/relaunch (third launch) and subsequent relaunches: WebView content is black.
  4. When the user manually disconnects the Movix VPN at Android/Google TV level while in the black-screen state, Movix renders correctly.
- FACTUAL CONSEQUENCE:
  - Restoring exact baseline `App.tsx` startup ordering did NOT eliminate the recurring black-screen sequence.
  - Therefore the TV-only "wait for VPN ready before WebView mount" modification is **not sufficient to explain the regression** and is demoted as primary cause.
  - The black-screen state still tracks the active VPN state strongly: manual VPN disconnect restores rendering.
- IMPORTANT CONTROL GAP:
  - The historical hardware-PASS test of `c543106` established that the baseline runtime could render on this TV, but it did not establish the same repeated multi-kill sequence under today's protocol.
  - A strict repeated-kill retest of the exact historical control is now scientifically valuable before changing native VPN code.
- WORKING HYPOTHESIS:
  - Focus shifts from React/WebView startup ordering to Android VPN service lifecycle / TUN state across app process kills and relaunches, or to a Google TV-specific interaction between that persistent DNS-only VPN and Chromium/WebView networking.
- NEXT ANALYSIS:
  - Inspect service lifecycle semantics (`START_STICKY`, `onDestroy`, `onRevoke`, static `isActive`) and whether repeated app kills can leave/recreate VPN/TUN state differently from handheld Android.


---

## Native VPN lifecycle finding after TV-BS-H

- DATE: 2026-09-22
- CONTROL COMPARISON:
  - `c543106779066d73fe8603efde9315e6a9fd4766` -> TV-BS-H runtime commit `6dbd88159e725add934eb4595f226dea5378eda5`
  - Only four repository files differ:
    - `TV_BLACK_SCREEN_INVESTIGATION.md` (documentation only)
    - `app/src/injection/tv-render-diagnostic.ts` (added diagnostic source, not referenced by the frozen baseline WebView runtime)
    - `app/src/platform/tvRuntimePolicy.ts` (only adds exported `TV_PRODUCT_FEATURES_ENABLED = false`; `resolveAndroidTvRuntime()` body is unchanged)
    - `app/tests/tvBaselineRuntimeDiagnosticContract.test.mjs` (test only)
  - Therefore TV-BS-H is functionally extremely close to the historical hardware-PASS baseline runtime.
- ANDROID BUILD CONTRACT:
  - `targetSdkVersion = 35`
  - `compileSdkVersion = 35`
  - `minSdkVersion = 24`
- NATIVE VPN SERVICE BEHAVIOR:
  - `DnsVpnService.onStartCommand()` returns `START_STICKY`.
  - Android's documented `START_STICKY` semantics allow the system to recreate a killed service later and call `onStartCommand()` with a null Intent when there is no pending start command.
  - `DnsVpnService` does **not** call `startForeground()`.
  - Android's documented VpnService behavior on API 26+ requires a VPN service launched in the background to promote itself to foreground or the system may shut it down.
- WHY THIS FITS THE HARDWARE SEQUENCE:
  - Repeated kill/relaunch cycles are exactly the scenario where a sticky service can enter system-driven recreation rather than clean app-driven startup.
  - The observed sequence (launch 1 partial, launch 2 perfect, launch 3+ black) is compatible with lifecycle/state accumulation or system-driven restart of the DNS-only VPN service.
  - Manual Android VPN disconnect immediately restoring Movix strongly keeps the VPN/TUN lifecycle as the leading causal area.
- SECONDARY NATIVE RISK:
  - `forwardDnsQuery()` calls `protect(socket)` but ignores the returned Boolean.
  - Android documents that an unprotected upstream socket whose destination is covered by VPN routes can loop back into the VPN; `protect()` returns false if the app is not prepared or has been revoked.
  - Do NOT change this together with service restart semantics in the next A/B.
- NEXT ONE-VARIABLE A/B RECOMMENDATION:
  - Starting from TV-BS-H, change only `DnsVpnService.onStartCommand()` return value from `START_STICKY` to `START_NOT_STICKY`.
  - Rationale: after an app/process kill, Android will not autonomously recreate the DNS VPN service; the next Movix launch will explicitly re-enable it from the normal app path.
  - Keep foreground-service behavior, `protect()`, App.tsx, WebView, DNS forwarding and all other runtime code unchanged for this diagnostic.
  - If the repeated sequence disappears across several kill/relaunch cycles, sticky VPN recreation is strongly implicated.
  - If it persists, the next observation target should be `protect(socket)` result / DNS forwarding lifecycle rather than broad WebView changes.


---

## TV-BS-I — disable sticky VPN recreation

- TEST ID: TV-BS-I
- DATE: 2026-09-22
- BASE: TV-BS-H runtime behavior.
- PURPOSE:
  - Test whether Android's autonomous recreation of the DNS VPN service after process kills is responsible for the repeated-kill black-screen sequence.
- UNIQUE RUNTIME VARIABLE:
  - `app/android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt`
  - normal `onStartCommand()` return changed from `START_STICKY` to `START_NOT_STICKY`.
  - stop-action path already returned `START_NOT_STICKY` and remains unchanged.
- EVERYTHING ELSE FROZEN:
  - `App.tsx`: `5fbe28710abf29ed78a478e1ca6bdf364f82b71a`
  - `WebViewBrowser.tsx`: `c42d8b9e33dd01af93ddadbf9f89ba432255784a`
  - `BrowserScreen.tsx`: `e7a7aae7f7754c49880b166006debff6b25efdbb`
  - `MirrorErrorScreen.tsx`: `39854aee4c3fda0915629de455059f61486c557e`
  - `inject.ts`: `4df61dd53d5bd8d9cb30368905aa20aac261d142`
  - `DnsModule.kt`: `0a4dfcda8717826b6d68eff4ed2295fa5f12fb92`
- NEW VPN BLOB:
  - `DnsVpnService.kt`: `d5bc90c71176b138836f766523e06fac57a350fe`
- TEST COMMIT / APK SOURCE COMMIT:
  - `750fecf99b3a31210b62c49fbf173a23a5612ea8`
  - message: `diag(tv): disable sticky DNS VPN recreation`
- CI:
  - workflow: Android TV foundations
  - run ID: `35731378372`
  - conclusion: PASS
  - diagnostic A/B contract: PASS
  - frontend production build: PASS
  - standalone Android APK build: PASS
  - merged TV/mobile manifest contract: PASS
  - standalone JS bundle packaged: PASS
- GITHUB ARTIFACT:
  - ID: `10695479060`
  - name: `movix-google-tv-standalone-apk`
  - artifact ZIP digest: `sha256:f5d4f9493e98a22f589e86c508e21ea32ab6f980e4b5d9de441aa4934af0c93d`
- APK:
  - file: `app-release.apk`
  - size: `72,593,302 bytes`
  - SHA-256: `ad1af2cb8f6b828f19a5e7739ad3b57bd5f0e524b4e96735ba91e300f44b8ac4`
- HARDWARE PROTOCOL:
  1. Install TV-BS-I.
  2. Leave Movix DNS/VPN enabled normally; do not manually resync/restart it.
  3. Record first launch behavior, especially whether page shell and images/posters load.
  4. Perform at least five complete kill/relaunch cycles.
  5. Record each launch independently as:
     - full success,
     - page without images,
     - fallback,
     - black WebView.
  6. Do not manually disconnect VPN unless a black state occurs; if black occurs, then disconnect once and record whether rendering immediately returns.
- EXPECTED DISCRIMINATOR:
  - If repeated black states disappear but first-launch-like partial loads recur, sticky service recreation is strongly implicated in the black-screen failure while DNS readiness remains a separate issue.
  - If the same `partial -> perfect -> black...` sequence persists, sticky recreation alone is not causal and the next diagnostic should instrument/validate `protect(socket)` and DNS forwarding state without broad product changes.
- USER HARDWARE RESULT: **PENDING**


---

## TV-BS-I hardware result — START_NOT_STICKY does not change failure sequence

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: TV-BS-I
- APK SOURCE COMMIT: `750fecf99b3a31210b62c49fbf173a23a5612ea8`
- APK SHA-256: `ad1af2cb8f6b828f19a5e7739ad3b57bd5f0e524b4e96735ba91e300f44b8ac4`
- UNIQUE TEST VARIABLE:
  - `DnsVpnService.onStartCommand()`: normal return `START_STICKY` -> `START_NOT_STICKY`.
- USER HARDWARE OBSERVATION:
  1. First launch: Movix logo + structural shell only; content images/assets do not complete.
  2. Second launch after kill: everything works correctly.
  3. Third and subsequent launches after kill: WebView content is black.
  4. In black state, manually disconnecting the VPN alone causes the normal "Movix injoignable" fallback.
  5. While VPN remains disconnected, pressing "Réessayer" on that fallback makes Movix render correctly.
- FACTUAL CONSEQUENCE:
  - Changing `START_STICKY` to `START_NOT_STICKY` does not materially alter the repeated-launch sequence.
  - Android sticky service recreation is therefore demoted as the primary cause.
- IMPORTANT STATE TRANSITION:
  - VPN ON + stale/black WebView -> VPN OFF => WebView emits network failure and fallback appears.
  - VPN OFF + fallback "Réessayer" => address resolution is rerun and a fresh WebView load succeeds.
  - Therefore "VPN OFF works" is specifically dependent on rebuilding/retrying the network/navigation state; merely dropping the VPN underneath the existing black WebView does not instantly restore the document.
- NEXT FOCUS:
  - VPN/TUN DNS forwarding behavior itself and its interaction with Android/Chromium resolver state.
  - Inspect exact packet classes routed to the TUN and limitations of the current forwarder (UDP-only, destination assumptions, protect() result ignored) before changing code.


---

## Architectural finding after TV-BS-I — current tunnel is IP-scoped, not port-scoped DNS-only

- DATE: 2026-09-22
- ANDROID API FACT:
  - `VpnService.Builder.addRoute(address, prefixLength)` installs an IP-prefix route. It does not filter by transport protocol or port.
- CURRENT MOVIX CONFIG:
  - `addDnsServer(primaryDns)` / `addDnsServer(secondaryDns)`
  - `addRoute(primaryDns, 32)` / `addRoute(secondaryDns, 32)`
  - Therefore **all IP traffic whose destination is 1.1.1.1 or 1.0.0.1** is sent into the TUN, not only DNS/53.
- CURRENT FORWARDER:
  - assumes everything arriving through the TUN is DNS solely because the routes point at Cloudflare IPs;
  - accepts only IPv4 UDP packets (`protocol == 17`);
  - does not verify destination UDP port 53 before treating the payload as DNS;
  - silently ignores TCP, including legitimate DNS-over-TCP fallback;
  - ignores the Boolean result of `protect(socket)`.
- CONSEQUENCE:
  - The current comment "Tout ce qui arrive ici est du DNS (grâce aux routes spécifiques)" is technically false.
  - Any non-DNS traffic to the Cloudflare IPs, and any DNS-over-TCP traffic, cannot be handled correctly by this forwarder.
- LEADING NEXT DIRECTION:
  - Stop routing the real Cloudflare resolver IPs into the TUN.
  - Expose a virtual DNS address inside the VPN (example: `10.215.173.2`) with a /32 route only to that virtual address.
  - Android sends configured DNS traffic to that virtual address.
  - Movix parses only DNS packets addressed to the virtual endpoint and forwards them to real upstream Cloudflare sockets protected from the VPN.
  - The actual upstream `1.1.1.1:53` / `1.0.0.1:53` sockets then travel directly over the underlying network and are not VPN routes.
  - Add explicit validation for protocol/port and support DNS TCP separately or via an alternative resolver implementation.
- STATUS:
  - TV-BS-I rules out START_STICKY as primary cause.
  - The next product-level experiment should target the tunnel architecture itself, preferably in isolated checkpoints so virtual-DNS routing and TCP/protect hardening are not conflated.


---

## TV-BS-J1 — virtual DNS endpoint inside TUN

- TEST ID: TV-BS-J1
- DATE: 2026-09-22
- BASE: TV-BS-I.
- PURPOSE:
  - Test whether routing the real Cloudflare IPs themselves into the TUN is the source of the Google TV failure.
- UNIQUE RUNTIME CHANGE:
  - `DnsVpnService.kt` now exposes virtual DNS `10.215.173.2` inside the VPN.
  - VPN interface remains `10.215.173.1/32`.
  - Android DNS server is now `10.215.173.2`.
  - The only TUN route is `10.215.173.2/32`.
  - Removed TUN routes to real upstream resolvers `1.1.1.1/32` and `1.0.0.1/32`.
  - Upstream DNS forwarding still uses protected sockets to `1.1.1.1:53`, then `1.0.0.1:53`.
  - J1 remains IPv4 UDP-only, but now explicitly verifies destination port 53 before parsing a packet as DNS.
- INTENTIONALLY NOT CHANGED YET:
  - no DNS-over-TCP support;
  - no `protect(socket)` Boolean enforcement;
  - no WebView/App startup changes;
  - no UI/product behavior changes;
  - preserves TV-BS-I `START_NOT_STICKY` semantics to keep J1 one-variable relative to I.
- NEW VPN BLOB:
  - `DnsVpnService.kt`: `4d5d5405a80c96c5a1d9e6c99e91683f39969d31`
- APK SOURCE COMMIT:
  - `9d8ba492b5aa3f21190622e7cd4c096dc3a38002`
  - message: `diag(tv): route DNS through virtual TUN endpoint`
- CI:
  - workflow: Android TV foundations
  - run ID: `35760946245`
  - conclusion: PASS
  - J1 diagnostic contract: PASS
  - frontend production build: PASS
  - standalone Android APK build: PASS
  - merged TV/mobile manifest contract: PASS
  - standalone JS bundle packaged: PASS
- GITHUB ARTIFACT:
  - ID: `10710725065`
  - name: `movix-google-tv-standalone-apk`
  - artifact ZIP digest: `sha256:e6e1f45caa096efa73dd472dcbaa94a0457a3303a40d7fb5f08daa3121c6754d`
- APK:
  - file: `app-release.apk`
  - size: `72,593,302 bytes`
  - SHA-256: `778510f0388152ac5bd1abfa8074efaba2ac670f51636a3795d56b5345bd8ae3`
- HARDWARE PROTOCOL:
  1. Install TV-BS-J1.
  2. Leave Movix DNS/VPN enabled normally.
  3. Record first launch as full / shell-only / fallback / black.
  4. Perform at least five complete kill/relaunch cycles with VPN left enabled.
  5. Record whether images/posters, search and normal navigation work on every successful launch.
  6. If black appears, first record it with VPN ON; then disconnect VPN once and record whether fallback appears; if fallback appears, press Retry once while VPN remains OFF and record the result.
- EXPECTED DISCRIMINATOR:
  - If the recurring third-launch black state disappears, routing the real Cloudflare resolver IPs into the TUN was materially involved.
  - If the same sequence persists, virtual routing alone is insufficient; next isolate DNS/TCP and `protect(socket)` behavior.
- USER HARDWARE RESULT: **PENDING**


---

## TV-BS-J1 hardware result — black screen eliminated, fallback remains

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: TV-BS-J1
- APK SOURCE COMMIT: `9d8ba492b5aa3f21190622e7cd4c096dc3a38002`
- APK SHA-256: `778510f0388152ac5bd1abfa8074efaba2ac670f51636a3795d56b5345bd8ae3`
- UNIQUE TEST VARIABLE:
  - real Cloudflare IP routes removed from the TUN;
  - virtual DNS endpoint `10.215.173.2/32` used instead;
  - UDP destination port 53 explicitly validated.
- USER HARDWARE OBSERVATION:
  1. First launch: Movix logo + structural shell only.
  2. Second launch after kill: everything works correctly.
  3. Third and subsequent launches: normal Movix fallback appears instead of a black WebView.
  4. On fallback, pressing "Réessayer" immediately makes Movix work.
- FACTUAL CONSEQUENCE:
  - TV-BS-J1 materially changes the failure mode.
  - The recurring black WebView state seen in H/I is eliminated under the observed hardware sequence.
  - Therefore routing the real Cloudflare resolver IPs themselves into the TUN was materially involved in the black-screen failure.
  - A remaining DNS/network readiness failure still exists, because launch 1 is partial and launch 3+ reaches fallback before a manual retry succeeds.
- IMPORTANT INTERPRETATION:
  - J1 separates two issues:
    A. black-screen/TUN pathology: strongly improved by virtual DNS routing;
    B. resolver readiness / first-attempt reliability: still unresolved.
  - The fact that fallback -> Retry succeeds without changing VPN state shows the remaining problem is likely a transient DNS/request timing or missing DNS transport case rather than a permanently broken tunnel.
- LEADING NEXT STEP:
  - Keep J1 architecture.
  - Add DNS-over-TCP support and enforce/check `protect(socket)` results in a separate checkpoint if possible.
  - Also consider an automatic one-shot retry only after the network/DNS layer is proven correct; do not hide a resolver defect with UI retries prematurely.


---

## TV-BS-J2A — concurrent UDP DNS forwarding

- TEST ID: TV-BS-J2A
- DATE: 2026-09-22
- BASE: TV-BS-J1.
- PURPOSE:
  - Test whether sequential, blocking DNS forwarding causes the remaining partial-load/fallback behavior.
- UNIQUE RUNTIME CHANGE:
  - Keep the J1 virtual DNS architecture unchanged.
  - Keep IPv4 UDP/53 only.
  - Replace single-file serial upstream DNS handling with a bounded pool of 8 concurrent workers.
  - Each DNS query is forwarded independently so one slow upstream response cannot block subsequent DNS queries.
  - Writes back to the TUN remain synchronized to prevent packet interleaving.
- INTENTIONALLY NOT CHANGED:
  - no DNS-over-TCP support;
  - no `protect(socket)` Boolean enforcement;
  - no App/WebView startup changes;
  - no retry/UI behavior changes;
  - `START_NOT_STICKY` retained from I/J1;
  - virtual DNS remains `10.215.173.2/32`.
- NEW VPN BLOB:
  - `DnsVpnService.kt`: `95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0`
- APK SOURCE COMMIT:
  - `3d69d59be46eb4810207bf8e206f218d369ffd85`
  - message: `diag(tv): forward virtual DNS queries concurrently`
- CI:
  - workflow: Android TV foundations
  - run ID: `35763062193`
  - conclusion: PASS
  - J2A diagnostic contract: PASS
  - frontend production build: PASS
  - standalone Android APK: PASS
  - merged TV/mobile manifest contract: PASS
  - standalone JS bundle packaged: PASS
- GITHUB ARTIFACT:
  - ID: `10710658748`
  - name: `movix-google-tv-standalone-apk`
  - artifact ZIP digest: `sha256:924951537a1d9792d1cd7884155da4ed09929f27c8e09133d7dfacfe29e7675f`
- APK:
  - file: `app-release.apk`
  - size: `72,593,302 bytes`
  - SHA-256: `47d75a55a29d20a692feb1a5a8a690e66330be4b697813bf6b704bdd8619babc`
- HARDWARE PROTOCOL:
  1. Install TV-BS-J2A.
  2. Leave Movix DNS/VPN enabled normally.
  3. Record first launch as full / shell-only / fallback / black.
  4. Perform at least five complete kill/relaunch cycles.
  5. Record every launch independently.
  6. On successful launches, verify posters/images, search and basic navigation.
  7. If fallback appears, press Retry once without changing VPN state and record whether it succeeds.
  8. Do not manually disconnect VPN unless black unexpectedly returns.
- EXPECTED DISCRIMINATOR:
  - If first launch and repeated relaunches become reliably complete, serial DNS head-of-line blocking was materially involved.
  - If J1 behavior persists (partial first launch, later fallback, Retry works), concurrency alone is insufficient and J2B should add DNS-over-TCP support next.
  - If black returns, stop and investigate concurrency/TUN write ordering before proceeding.
- USER HARDWARE RESULT: **PENDING**


---

## TV-BS-J2A hardware result — first launch fixed, repeated-launch fallback remains

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: TV-BS-J2A
- APK SOURCE COMMIT: `3d69d59be46eb4810207bf8e206f218d369ffd85`
- APK SHA-256: `47d75a55a29d20a692feb1a5a8a690e66330be4b697813bf6b704bdd8619babc`
- UNIQUE TEST VARIABLE:
  - J1 virtual DNS architecture preserved;
  - UDP/53 forwarding changed from serial/blocking to 8 concurrent workers with synchronized TUN writes.
- USER HARDWARE OBSERVATION:
  1. First launch: OK.
  2. Second launch after kill: OK.
  3. Third and subsequent launches: fallback.
  4. On fallback, pressing "Réessayer" succeeds immediately.
- FACTUAL CONSEQUENCE:
  - Concurrent UDP DNS forwarding materially improves startup reliability versus J1:
    - J1 first launch: shell/logo only.
    - J2A first launch: fully OK.
  - Therefore serial head-of-line blocking in the DNS relay was materially involved in the first-launch partial-load failure.
  - The recurring third-launch fallback is NOT solved by UDP concurrency alone.
  - Black WebView does not return under this observed sequence, so J1's virtual-DNS routing improvement remains effective.
- LEADING NEXT STEP:
  - Keep J2A unchanged.
  - Add DNS-over-TCP support as TV-BS-J2B, still limited to the virtual DNS endpoint and port 53.
  - Do not add automatic UI retry yet; the remaining failure should be fixed at the resolver/transport layer if possible.


---

## Post-J2A code-path finding — remaining fallback matches DNS startup race

- DATE: 2026-09-22
- VERIFIED CODE PATH:
  - In `App.tsx`, when `dns_enabled === "true"` but `DnsModule.isEnabled()` is false on Android:
    - `DnsModule.enable("1.1.1.1", "1.0.0.1").catch(() => {})` is fired without await.
    - `setDnsSettled(true)` is called immediately.
    - `setReady(true)` follows in `finally`, so `AddressProvider` / `BrowserScreen` can mount while the VPN is still starting.
  - In `DnsModule.kt`, `enable()` with already-granted VPN permission calls `startVpnService(...)` and then immediately `promise.resolve(true)`.
  - That Promise therefore confirms only that Android service start was requested, NOT that `DnsVpnService.startVpn()` has completed `Builder.establish()` and set `isActive = true`.
- INTERPRETATION OF J2A HARDWARE:
  - Launch 1 OK and launch 2 OK show J2A's concurrent virtual-DNS relay materially improved resolver performance.
  - Launch 3+ fallback followed by immediate successful Retry is strongly compatible with a startup race:
    - first address/WebView attempt can run before DNS VPN is actually active;
    - by the time fallback is shown and Retry is pressed, the service has finished establishing the tunnel.
- CORRECTION TO PREVIOUS NEXT-STEP ORDER:
  - Do NOT add DNS-over-TCP next.
  - Raw TCP inside a TUN requires proper TCP termination/state handling; it is not a small equivalent of the UDP forwarding code and should not be introduced without evidence it is needed.
- NEXT CLEAN A/B:
  - Keep J2A networking architecture and concurrency frozen.
  - On the stored-enabled / native-disabled Android relaunch path only:
    1. call `DnsModule.enable(...)`;
    2. poll `DnsModule.isEnabled()` until true with a bounded timeout;
    3. only then mark DNS settled / mount the address+WebView path.
  - Do not change first-install prompt behavior.
  - Do not add UI retry automation.
  - This re-tests DNS readiness gating on top of the corrected J1/J2A virtual-DNS architecture, where the prior black-screen TUN pathology has already been removed.


---

## TV-BS-J2B — gate Android relaunch on actual DNS VPN readiness

- TEST ID: TV-BS-J2B
- DATE: 2026-09-22
- BASE: TV-BS-J2A.
- PURPOSE:
  - Test whether the remaining third-launch fallback is caused by AddressProvider/WebView starting before the DNS VPN service is actually active.
- UNIQUE RUNTIME CHANGE:
  - `DnsVpnService.kt` remains byte-for-byte identical to J2A.
  - On Android only, when persisted `dns_enabled === "true"` but native `DnsModule.isEnabled()` is false:
    1. await `DnsModule.enable("1.1.1.1", "1.0.0.1")`;
    2. poll `DnsModule.isEnabled()` every 100 ms;
    3. wait until it reports true, with a hard 5-second timeout;
    4. only then mark DNS settled / allow AddressProvider + BrowserScreen to mount.
- INTENTIONALLY NOT CHANGED:
  - first-install DNS prompt remains non-blocking;
  - no manual DNS restart/resync;
  - no post-ready grace delay;
  - no WebView changes;
  - no UI retry automation;
  - J1 virtual DNS endpoint remains `10.215.173.2/32`;
  - J2A 8-worker UDP/53 concurrency remains unchanged;
  - no DNS-over-TCP support added.
- APP BLOB:
  - `App.tsx`: `2ccebcaee11394baa0c2c34db7b8bcb8ea038b30`
- FROZEN VPN BLOB:
  - `DnsVpnService.kt`: `95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0`
- APK SOURCE COMMIT:
  - `dd01dfe4c1debb53ad7ba534f092a06131457773`
  - message: `diag(tv): await DNS readiness before relaunch`
- CI:
  - workflow: Android TV foundations
  - run ID: `35765380367`
  - conclusion: PASS
  - J2B diagnostic contract: PASS
  - frontend production build: PASS
  - standalone Android APK: PASS
  - merged TV/mobile manifest contract: PASS
  - standalone JS bundle packaged: PASS
- GITHUB ARTIFACT:
  - ID: `10711614658`
  - name: `movix-google-tv-standalone-apk`
  - artifact ZIP digest: `sha256:d7cb27740a2fff5b68a0470d4e7c0b318bdf94667282f4c72931fa90075bcbdb`
- APK:
  - file: `app-release.apk`
  - size: `72,593,538 bytes`
  - SHA-256: `22327fde1f4389f480ab7dc32b542f78b56dfaf8dbcd349050df3734ced4bad3`
- HARDWARE PROTOCOL:
  1. Install TV-BS-J2B.
  2. Leave Movix DNS/VPN enabled normally.
  3. Record first launch.
  4. Perform at least five complete kill/relaunch cycles.
  5. Record every launch independently as full success / partial / fallback / black.
  6. Do not press Retry unless fallback appears.
  7. If fallback appears, press Retry once without changing VPN state and record whether it succeeds.
- EXPECTED DISCRIMINATOR:
  - If launches 3+ now succeed directly, the remaining J2A fallback was a DNS-service readiness race.
  - If fallback persists unchanged, `isActive` is not a sufficient readiness signal and the next diagnostic should validate actual DNS query success rather than merely service state.
- USER HARDWARE RESULT: **PENDING**


---

## TV-BS-J2B hardware result — readiness gating worsens launch behavior

- DATE OF HARDWARE RESULT: 2026-09-22
- APK: TV-BS-J2B
- APK SOURCE COMMIT: `dd01dfe4c1debb53ad7ba534f092a06131457773`
- APK SHA-256: `22327fde1f4389f480ab7dc32b542f78b56dfaf8dbcd349050df3734ced4bad3`
- UNIQUE TEST VARIABLE:
  - J2A virtual-DNS + concurrent UDP relay frozen;
  - on stored-enabled/native-disabled Android relaunch, app waits for `DnsModule.isEnabled() === true` before mounting address/WebView path.
- USER HARDWARE OBSERVATION:
  1. First launch: structural shell only.
  2. Second and subsequent launches: fallback.
  3. On every fallback, pressing "Réessayer" succeeds.
- FACTUAL CONSEQUENCE:
  - Gating startup on `isActive/isEnabled === true` does NOT solve the repeated-launch fallback.
  - Compared with J2A (launch 1 OK, launch 2 OK, launch 3+ fallback), J2B is worse:
    - launch 1 regresses to shell-only;
    - launch 2 already falls back.
  - Therefore `DnsVpnService.isActive === true` is NOT a sufficient signal that the DNS path is actually usable by AddressResolver/WebView.
  - More importantly, delaying initial address/WebView startup until after the VPN becomes active is itself correlated with worse behavior on this TV, consistent with earlier tests where pre-WebView VPN readiness produced failures.
- NEXT ACTION REQUESTED BY USER:
  - Re-read the complete experiment history before making another code change.
  - Derive a solution that explains the entire observed sequence rather than stacking more local patches.
