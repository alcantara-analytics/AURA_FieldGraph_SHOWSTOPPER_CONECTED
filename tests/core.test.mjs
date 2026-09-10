import assert from 'node:assert/strict';
import { orchestrate } from '../src/core/AuraOrchestrator.js';
import { detectConflicts } from '../src/intelligence/ConflictEngine.js';
import { calculateTrustFromEvidence } from '../src/intelligence/TrustEngine.js';
import { buildCustomer360 } from '../src/dashboard/Customer360.js';
import { generateInsights } from '../src/intelligence/InsightEngine.js';
import { parseJsonObject } from '../src/ai/QVACRuntime.js';

const evidence = [
  {
    assetId: 'A1', source: 'VOICE', sourceQuality: 0.72,
    facts: { customer: 'DemoCare Horizon', modality: 'MR', quantity: 3, installedYear: 2017 }
  },
  {
    assetId: 'A1', source: 'VISIONPSY', sourceQuality: 0.95,
    facts: { customer: 'DemoCare Horizon', modality: 'MR', manufacturer: 'BluePeak', model: 'MR-X500', serial: 'BP88921' }
  }
];

const fused = orchestrate(evidence, {});
assert.equal(fused.asset.model, 'MR-X500');
assert.equal(fused.asset.serial, 'BP88921');
assert.equal(fused.nextAction, 'VERIFIED');
assert.ok(fused.confidence >= 80);

assert.equal(detectConflicts([...evidence, { assetId: 'A1', source: 'MANUAL', facts: { model: 'MR-X700' } }]).length, 1);
assert.equal(detectConflicts([
  { assetId: 'A1', source: 'MANUAL', facts: { model: 'MR-X500' } },
  { assetId: 'A2', source: 'MANUAL', facts: { model: 'CT-X900' } }
]).length, 0);

assert.equal(calculateTrustFromEvidence([]).score, 0);
assert.deepEqual(parseJsonObject('```json\n{"modality":"MR"}\n```'), { modality: 'MR' });

const c360 = buildCustomer360([{ customer: 'DemoCare Horizon', modality: 'MR', quantity: 3, confidence: 86 }], 'DemoCare Horizon');
assert.equal(c360.installedBase.MR, 3);
assert.equal(c360.assets, 1);

assert.equal(generateInsights(fused.asset, 2026)[0].type, 'lifecycle');

console.log('AURA core tests: PASS');
