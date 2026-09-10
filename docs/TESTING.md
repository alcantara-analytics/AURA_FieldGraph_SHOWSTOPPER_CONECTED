# AURA FieldGraph test checklist

## A. Build gate

- [ ] `node --version` is >= 22.17.
- [ ] `npm --version` is >= 10.9.
- [ ] `npm install` succeeds.
- [ ] `npx expo-doctor` reports no blocking dependency mismatch.
- [ ] `npx expo prebuild --clean` succeeds.
- [ ] Physical Android 12+ device appears in `adb devices`.
- [ ] `npm run android` installs and launches AURA.

## B. App initialization

- [ ] SYSTEM card renders.
- [ ] QVAC status is visible and does not crash the app.
- [ ] SQLite initializes without `table already exists` errors.
- [ ] Clear local demo data works repeatedly.

## C. Deterministic downstream pipeline

- [ ] Run deterministic showstopper demo.
- [ ] Current asset becomes BluePeak MR-X500 / BP88921.
- [ ] Evidence Graph displays two sources.
- [ ] Conflict Engine says no conflict.
- [ ] Customer 360 shows persisted data.
- [ ] Lifecycle insight flags the 2017 equipment age.

## D. QVAC text smoke test

Input: `DemoCare Horizon has three MR systems installed around 2017.`

- [ ] VisionPsy downloads/loads on first run.
- [ ] The app remains responsive while progress is shown.
- [ ] Returned JSON is parsed without Markdown fences.
- [ ] Customer, modality, quantity and installed year appear only when supported by model output.
- [ ] Evidence is persisted.

## E. VisionPsy image test

- [ ] Camera permission is requested once.
- [ ] Camera preview opens.
- [ ] Photo is captured.
- [ ] VisionPsy receives the local image path.
- [ ] Manufacturer/model/serial shown in UI match visible evidence.
- [ ] Unsupported/unreadable fields remain null instead of being invented.

## F. Conflict test

Capture two observations for the same current asset with contradictory models, for example `MR-X500` and `MR-X700`.

- [ ] Conflict Engine flags only `model`.
- [ ] It does not flag model differences across two different asset IDs.
- [ ] Verification state becomes `RESOLVE_CONFLICT`.

## G. Persistence test

- [ ] Close and reopen the app after capture.
- [ ] Customer 360 uses previously persisted assets.
- [ ] Database operations do not duplicate schema or crash.
