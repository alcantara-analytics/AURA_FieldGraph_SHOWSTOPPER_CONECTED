export function generateInsights(asset = {}, currentYear = new Date().getFullYear()) {
  const insights = [];
  const installedYear = Number(asset.installedYear);
  const age = Number.isFinite(installedYear) && installedYear > 1900 ? currentYear - installedYear : null;

  if (age !== null && age >= 7) {
    insights.push({
      type: 'lifecycle',
      priority: age >= 10 ? 'critical' : 'high',
      title: 'Replacement window approaching',
      detail: `${asset.modality || 'Equipment'} is approximately ${age} years old. Validate lifecycle and replacement opportunity.`
    });
  }
  if (!asset.serial) {
    insights.push({
      type: 'data_quality',
      priority: 'medium',
      title: 'Serial evidence missing',
      detail: 'Capture a nameplate or serial label to strengthen identity confidence.'
    });
  }
  if (!insights.length) {
    insights.push({
      type: 'monitoring',
      priority: 'low',
      title: 'Asset in monitoring',
      detail: 'No high-priority lifecycle signal is currently supported by the captured evidence.'
    });
  }
  return insights;
}

export function generateInsight(asset = {}) {
  return generateInsights(asset)[0];
}
