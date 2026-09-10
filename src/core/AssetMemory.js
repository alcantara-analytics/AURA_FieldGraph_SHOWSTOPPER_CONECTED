import { makeId, nowIso } from '../utils/ids.js';

export function createEvidence({ assetId, source, sourceQuality, facts, uri = null, rawText = null, engine = null }) {
  return {
    id: makeId('evidence'),
    assetId,
    source,
    sourceQuality,
    facts: facts || {},
    uri,
    rawText,
    engine,
    createdAt: nowIso()
  };
}

export function addHistoryEvent(history = [], assetId, event, detail = null) {
  return [
    ...history,
    { id: makeId('history'), assetId, event, detail, createdAt: nowIso() }
  ];
}

export function mergeEvidence(memory = [], evidence) {
  return [...memory, evidence];
}
