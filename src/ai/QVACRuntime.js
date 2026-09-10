let sdkPromise = null;
let visionModelId = null;
let voiceModelId = null;
let visionLoading = null;
let voiceLoading = null;

function cleanFilePath(uri) {
  if (!uri) return uri;
  return uri.startsWith('file://') ? decodeURIComponent(uri.replace('file://', '')) : uri;
}

function emit(onStatus, message, progress = null) {
  if (typeof onStatus === 'function') onStatus({ message, progress });
}

async function getSdk() {
  if (!sdkPromise) sdkPromise = import('@qvac/sdk');
  return sdkPromise;
}

async function collectCompletion(result) {
  let text = '';
  if (result?.tokenStream) {
    for await (const token of result.tokenStream) text += token;
    return text.trim();
  }
  if (typeof result === 'string') return result.trim();
  return String(result?.text ?? result?.content ?? '').trim();
}

export function parseJsonObject(raw) {
  if (!raw) return {};
  const cleaned = String(raw)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
    }
  }
  return {};
}

async function ensureVisionModel(onStatus) {
  if (visionModelId) return visionModelId;
  if (visionLoading) return visionLoading;

  visionLoading = (async () => {
    const sdk = await getSdk();
    emit(onStatus, 'Loading VisionPsy Nano…', 0);
    const id = await sdk.loadModel({
      modelSrc: sdk.VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
      modelConfig: {
        ctx_size: 2048,
        projectionModelSrc: sdk.MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
        image_no_upscale: 'on'
      },
      onProgress: p => emit(onStatus, 'Downloading VisionPsy Nano…', Math.round(p.percentage ?? 0))
    });
    visionModelId = id;
    emit(onStatus, 'VisionPsy Nano ready', 100);
    return id;
  })();

  try { return await visionLoading; }
  finally { visionLoading = null; }
}

async function ensureVoiceModel(onStatus) {
  if (voiceModelId) return voiceModelId;
  if (voiceLoading) return voiceLoading;

  voiceLoading = (async () => {
    const sdk = await getSdk();
    emit(onStatus, 'Loading local speech model…', 0);
    const id = await sdk.loadModel({
      modelSrc: sdk.WHISPER_TINY,
      modelConfig: {
        language: '',
        translate: false,
        temperature: 0,
        suppress_blank: true,
        suppress_nst: true
      },
      onProgress: p => emit(onStatus, 'Downloading speech model…', Math.round(p.percentage ?? 0))
    });
    voiceModelId = id;
    emit(onStatus, 'Local speech model ready', 100);
    return id;
  })();

  try { return await voiceLoading; }
  finally { voiceLoading = null; }
}

const FACT_PROMPT = `You are AURA FieldGraph, an offline field-intelligence extractor for medical equipment.
Return ONLY valid JSON. Never invent values that are not supported by the observation.
Schema:
{
  "customer": string|null,
  "modality": string|null,
  "manufacturer": string|null,
  "model": string|null,
  "serial": string|null,
  "quantity": number|null,
  "installedYear": number|null,
  "notes": string|null
}
Normalize modality names when clear (MR, CT, Ultrasound, X-Ray, PET, SPECT).`;

export async function extractStructuredFacts(text, { onStatus } = {}) {
  if (!text?.trim()) return {};
  const sdk = await getSdk();
  const modelId = await ensureVisionModel(onStatus);
  emit(onStatus, 'Structuring observation locally…');
  const result = sdk.completion({
    modelId,
    history: [
      { role: 'system', content: FACT_PROMPT },
      { role: 'user', content: `Observation:\n${text}` }
    ],
    stream: true
  });
  return parseJsonObject(await collectCompletion(result));
}

export async function analyzeEquipmentImage(imageUri, { onStatus } = {}) {
  const sdk = await getSdk();
  const modelId = await ensureVisionModel(onStatus);
  emit(onStatus, 'VisionPsy is reading equipment evidence…');
  const result = sdk.completion({
    modelId,
    history: [
      { role: 'system', content: FACT_PROMPT },
      {
        role: 'user',
        content: 'Inspect this equipment photo or nameplate. Extract only facts visibly supported by the image. Return JSON only.',
        attachments: [{ path: cleanFilePath(imageUri) }]
      }
    ],
    stream: true
  });
  const raw = await collectCompletion(result);
  return { facts: parseJsonObject(raw), raw, engine: 'QVAC VisionPsy Nano', execution: 'local' };
}

export async function transcribeAudio(audioUri, { onStatus } = {}) {
  const sdk = await getSdk();
  const modelId = await ensureVoiceModel(onStatus);
  emit(onStatus, 'Transcribing locally with QVAC…');
  const text = await sdk.transcribe({
    modelId,
    audioChunk: cleanFilePath(audioUri)
  });
  return { text: String(text ?? '').trim(), engine: 'QVAC Whisper', execution: 'local' };
}

export async function qvacHealthCheck() {
  try {
    const sdk = await getSdk();
    const required = ['loadModel', 'completion', 'transcribe'];
    const missing = required.filter(k => typeof sdk[k] !== 'function');
    if (missing.length) return { available: false, detail: `Missing SDK functions: ${missing.join(', ')}` };
    return { available: true, detail: 'QVAC SDK loaded. Models load lazily on first use.' };
  } catch (error) {
    return { available: false, detail: error?.message || String(error) };
  }
}

export async function unloadQvacModels() {
  try {
    const sdk = await getSdk();
    if (visionModelId) await sdk.unloadModel({ modelId: visionModelId, clearStorage: false });
    if (voiceModelId) await sdk.unloadModel({ modelId: voiceModelId, clearStorage: false });
    visionModelId = null;
    voiceModelId = null;
  } catch (_) {
    visionModelId = null;
    voiceModelId = null;
  }
}
