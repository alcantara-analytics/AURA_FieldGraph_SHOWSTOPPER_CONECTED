import { analyzeEquipmentImage } from '../ai/QVACRuntime.js';

export async function processImage(imageUri, options = {}) {
  if (!imageUri) throw new Error('An image URI is required.');
  const result = await analyzeEquipmentImage(imageUri, options);
  return {
    type: 'image',
    source: 'VISIONPSY',
    sourceQuality: 0.95,
    uri: imageUri,
    facts: result.facts,
    raw: result.raw,
    engine: result.engine,
    execution: result.execution
  };
}
