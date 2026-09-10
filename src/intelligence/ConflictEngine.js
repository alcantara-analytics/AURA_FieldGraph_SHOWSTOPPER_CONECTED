const TRACKED_FIELDS = ['customer', 'modality', 'manufacturer', 'model', 'serial', 'quantity', 'installedYear'];

function normalized(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim().toLowerCase();
}

export function detectConflicts(evidenceItems = []) {
  const conflicts = [];
  const byAsset = new Map();

  for (const item of evidenceItems) {
    const assetKey = item.assetId || 'CURRENT_ASSET';
    if (!byAsset.has(assetKey)) byAsset.set(assetKey, []);
    byAsset.get(assetKey).push(item);
  }

  for (const [assetId, items] of byAsset.entries()) {
    for (const field of TRACKED_FIELDS) {
      const candidates = items
        .map(item => ({ source: item.source, value: item.facts?.[field] }))
        .filter(x => x.value !== null && x.value !== undefined && String(x.value).trim() !== '');
      const unique = new Map();
      for (const candidate of candidates) unique.set(normalized(candidate.value), candidate.value);
      if (unique.size > 1) {
        conflicts.push({ assetId, field, values: candidates });
      }
    }
  }
  return conflicts;
}

export function detectConflict(items = []) {
  return detectConflicts(items).length > 0;
}
