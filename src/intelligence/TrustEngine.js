const SOURCE_WEIGHTS = {
  SERIAL_PLATE: 1.0,
  VISIONPSY: 0.95,
  OCR: 0.9,
  DATABASE: 0.82,
  ENGINEER_REPORT: 0.8,
  VOICE: 0.72,
  MANUAL: 0.65,
  DEMO: 0.6
};

const FIELD_IMPORTANCE = {
  serial: 1.0,
  model: 0.9,
  manufacturer: 0.85,
  modality: 0.8,
  quantity: 0.75,
  installedYear: 0.7,
  customer: 0.65
};

function norm(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim().toLowerCase();
}

export function calculateTrustFromEvidence(evidenceItems = []) {
  if (!evidenceItems.length) return { score: 0, fields: {}, coverage: 0, agreement: 0 };

  const fields = {};
  let weightedScore = 0;
  let importanceTotal = 0;
  let covered = 0;
  let agreementAccum = 0;
  let agreementFields = 0;

  for (const field of Object.keys(FIELD_IMPORTANCE)) {
    const observations = evidenceItems
      .map(item => ({
        source: item.source,
        value: item.facts?.[field],
        quality: item.sourceQuality ?? SOURCE_WEIGHTS[item.source] ?? 0.6
      }))
      .filter(x => x.value !== null && x.value !== undefined && String(x.value).trim() !== '');

    if (!observations.length) continue;
    covered += 1;
    const groups = new Map();
    for (const obs of observations) {
      const key = norm(obs.value);
      if (!groups.has(key)) groups.set(key, { value: obs.value, support: 0, sources: [] });
      const group = groups.get(key);
      group.support += obs.quality;
      group.sources.push(obs.source);
    }
    const sorted = [...groups.values()].sort((a, b) => b.support - a.support);
    const best = sorted[0];
    const totalSupport = sorted.reduce((sum, g) => sum + g.support, 0);
    const agreement = totalSupport ? best.support / totalSupport : 0;
    const sourceStrength = Math.min(1, best.support / 1.25);
    const confidence = Math.round((0.62 * sourceStrength + 0.38 * agreement) * 100);
    fields[field] = { value: best.value, confidence, sources: best.sources, agreement: Math.round(agreement * 100) };

    const importance = FIELD_IMPORTANCE[field];
    weightedScore += confidence * importance;
    importanceTotal += importance;
    agreementAccum += agreement;
    agreementFields += 1;
  }

  const raw = importanceTotal ? weightedScore / importanceTotal : 0;
  const coverage = covered / Object.keys(FIELD_IMPORTANCE).length;
  const coverageAdjusted = raw * (0.72 + 0.28 * coverage);
  return {
    score: Math.round(Math.min(100, coverageAdjusted)),
    fields,
    coverage: Math.round(coverage * 100),
    agreement: Math.round((agreementFields ? agreementAccum / agreementFields : 0) * 100)
  };
}

export function calculateTrust(asset = {}) {
  if (Array.isArray(asset.evidenceItems)) return calculateTrustFromEvidence(asset.evidenceItems).score;
  const pseudo = [{ source: 'MANUAL', facts: asset, sourceQuality: 0.65 }];
  return calculateTrustFromEvidence(pseudo).score;
}
