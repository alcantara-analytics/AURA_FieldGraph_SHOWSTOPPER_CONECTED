export function buildCustomer360(assets = [], customerName = null) {
  const scoped = customerName ? assets.filter(a => a.customer === customerName) : assets;
  const installedBase = {};
  let confidenceSum = 0;
  let confirmed = 0;
  let estimated = 0;
  let unknown = 0;

  for (const asset of scoped) {
    const modality = asset.modality || 'Unknown';
    const qty = Math.max(1, Number(asset.quantity) || 1);
    installedBase[modality] = (installedBase[modality] || 0) + qty;
    const confidence = Number(asset.confidence) || 0;
    confidenceSum += confidence;
    if (confidence >= 80) confirmed += 1;
    else if (confidence >= 50) estimated += 1;
    else unknown += 1;
  }

  const count = scoped.length || 1;
  return {
    name: customerName || scoped[0]?.customer || 'Unassigned customer',
    assets: scoped.length,
    installedBase,
    averageConfidence: scoped.length ? Math.round(confidenceSum / scoped.length) : 0,
    quality: { confirmed, estimated, unknown, denominator: scoped.length || count }
  };
}

export const Customer360 = buildCustomer360([
  { customer: 'DemoCare Horizon', modality: 'MR', quantity: 3, confidence: 92 },
  { customer: 'DemoCare Horizon', modality: 'CT', quantity: 2, confidence: 84 },
  { customer: 'DemoCare Horizon', modality: 'Ultrasound', quantity: 5, confidence: 76 }
], 'DemoCare Horizon');
