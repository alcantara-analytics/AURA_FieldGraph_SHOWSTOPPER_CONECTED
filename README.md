# AURA FieldGraph — Showstopper Build v14

AURA FieldGraph turns field observations into an evidence-backed local asset graph.

**Primary flow**

Voice / typed observation / equipment photo → QVAC local AI → structured facts → evidence fusion → trust scoring → conflict detection → SQLite persistence → Customer 360 → lifecycle insights.

## What is real in v14

- QVAC SDK integration through `@qvac/sdk`.
- VisionPsy Nano (Flash) multimodal inference for equipment/nameplate photos.
- QVAC local speech transcription through Whisper when the captured audio format is supported by the runtime.
- QVAC text-to-structured-facts extraction.
- Real camera capture with `expo-camera`.
- Real microphone capture with `expo-audio`.
- Persistent local SQLite database with assets, evidence, fact-level provenance and history.
- Trust score based on source quality, cross-source agreement and field coverage.
- Same-asset / same-field conflict detection.
- Customer 360 generated from persisted assets.
- Lifecycle/data-quality insights.
- Deterministic demo mode that exercises the downstream pipeline without downloading AI models.

## Important QVAC requirement

QVAC mobile inference requires a **physical Android/iOS device and a native development build**. Do not use an emulator for QVAC inference. Expo Go is not the target runtime for this build because QVAC adds native code through its Expo plugin.

Current QVAC requirements also call for Node.js >= 22.17, npm >= 10.9 and Expo >= 54. Android inference requires Android 12+; iOS requires iOS 17+.

## Windows / Android quick start

Prerequisites:

1. Node.js 22.17+ and npm 10.9+.
2. Android Studio + Android SDK configured.
3. A physical Android 12+ phone with Developer Options and USB debugging enabled.
4. USB cable (or configured wireless ADB).

From PowerShell in the repository:

```powershell
node --version
npm --version
npm install
npx expo-doctor
npx expo prebuild --clean
adb devices
npm run android
```

The first real QVAC inference downloads the selected model weights. Keep the phone online for that first model retrieval. Inference itself then runs locally.

Start the Metro server later with:

```powershell
npm start
```

## First smoke test

1. Open the app on the physical phone.
2. Check the SYSTEM card. It should report `QVAC SDK READY`.
3. Before downloading models, tap **Run deterministic showstopper demo**. This validates orchestration, trust, conflicts, SQLite, Customer 360 and insights.
4. Type a field note and tap **Analyze typed observation with QVAC**. This triggers the first VisionPsy model load/download and validates QVAC text completion.
5. Tap **Scan equipment**, photograph a real equipment/nameplate image and wait for VisionPsy extraction.
6. Record a short voice observation and stop it. The app invokes QVAC local transcription and then structures the transcript.

## Recommended demo sentence

> DemoCare Horizon has three MR systems installed around 2017.

Then scan a plate containing manufacturer, model and serial information. The trust score should increase as independent evidence agrees.

## Audio compatibility note

QVAC's published speech examples use WAV/PCM input, while Expo's standard Android recorder commonly produces AAC/M4A. The app passes the recorded local file directly to QVAC and displays the real runtime error if that device/runtime combination cannot decode it. The typed-observation path remains a fully local QVAC fallback, and the VisionPsy photo path is independent of speech.

For a production-grade Android voice path, standardize microphone capture to a QVAC-supported PCM/WAV format rather than silently pretending an incompatible recording was transcribed.

## QVAC configuration

`qvac.config.json` bundles only the capabilities used by AURA:

```json
{
  "plugins": [
    "@qvac/sdk/llamacpp-completion/plugin",
    "@qvac/sdk/whispercpp-transcription/plugin"
  ]
}
```

`app.json` includes:

- `@qvac/sdk/expo-plugin`
- `expo-build-properties`
- camera and microphone native permissions
- Android min SDK 31 (Android 12)
- iOS deployment target 17.0

## Architecture

```text
App.js
  ├─ multimodal/VoiceModule.js
  │    └─ ai/QVACRuntime.js
  ├─ multimodal/VisionModule.js
  │    └─ ai/QVACRuntime.js (VisionPsy Nano)
  ├─ core/AuraOrchestrator.js
  │    ├─ intelligence/TrustEngine.js
  │    └─ intelligence/ConflictEngine.js
  ├─ database/Database.js
  │    └─ database/schema.js
  ├─ dashboard/Customer360.js
  └─ intelligence/InsightEngine.js
```

## Data model

`assets` stores the current resolved view of the equipment.

`evidence` stores each observation and its source.

`fact_evidence` stores provenance at field level, so a model/serial/manufacturer can be traced back to the evidence that supports it.

`history` stores asset events over time.

## Troubleshooting

### QVAC SDK fails immediately

Confirm you built the native project after adding the QVAC plugin:

```powershell
npx expo prebuild --clean
npm run android
```

Do not expect the QVAC native worker to run in an Android emulator.

### Dependency mismatch

```powershell
npx expo install --fix
npx expo-doctor
```

### Device is not detected

```powershell
adb devices
```

Accept the USB debugging prompt on the phone.

### Model download is slow on first inference

This is expected on the first run. AURA reuses the loaded model during the app session.

## Privacy model

No cloud API key is required by this repository. QVAC inference is designed to execute locally on the device. SQLite data is stored locally in the app database.
