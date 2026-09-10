import { detectConflicts } from '../intelligence/ConflictEngine.js';
import { calculateTrustFromEvidence } from '../intelligence/TrustEngine.js';

const FACT_FIELDS = ['customer', 'modality', 'manufacturer', 'model', 'serial', 'quantity', 'installedYear', 'notes'];

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

export function orchestrate(evidenceItems = [], previousAsset = {}) {
  const trust = calculateTrustFromEvidence(evidenceItems);
  const conflicts = detectConflicts(evidenceItems);
  const asset = { ...previousAsset };

  for (const field of FACT_FIELDS) {
    if (trust.fields[field]?.value !== undefined) asset[field] = trust.fields[field].value;
  }

  const missingIdentity = !asset.modality || (!asset.model && !asset.serial);
  const nextAction = conflicts.length
    ? 'RESOLVE_CONFLICT'
    : missingIdentity || trust.score < 70
      ? 'REQUEST_EVIDENCE'
      : 'VERIFIED';

  return {
    asset,
    confidence: trust.score,
    trust,
    conflicts,
    nextAction,
    evidenceCount: evidenceItems.length,
    supportedFields: FACT_FIELDS.filter(f => hasValue(asset[f]))
  };
}
