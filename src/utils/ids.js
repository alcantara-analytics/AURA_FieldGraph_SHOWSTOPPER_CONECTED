export function makeId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}
