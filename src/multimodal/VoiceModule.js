import { extractStructuredFacts, transcribeAudio } from '../ai/QVACRuntime.js';

export async function processVoice(audioUri, options = {}) {
  if (!audioUri) throw new Error('An audio URI is required.');
  const transcription = await transcribeAudio(audioUri, options);
  const facts = await extractStructuredFacts(transcription.text, options);
  return {
    type: 'voice',
    source: 'VOICE',
    sourceQuality: 0.72,
    uri: audioUri,
    text: transcription.text,
    facts,
    engine: transcription.engine,
    execution: transcription.execution
  };
}
