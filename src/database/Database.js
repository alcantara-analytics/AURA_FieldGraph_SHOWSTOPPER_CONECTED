import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema.js';
import { nowIso } from '../utils/ids.js';

let dbPromise = null;

export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('aura-fieldgraph.db');
      await db.execAsync(SCHEMA_SQL);
      return db;
    })();
  }
  return dbPromise;
}

export async function upsertAsset(asset) {
  const db = await getDatabase();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO assets
      (id, customer, modality, manufacturer, model, serial, quantity, installed_year, confidence, verification_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       customer=excluded.customer,
       modality=excluded.modality,
       manufacturer=excluded.manufacturer,
       model=excluded.model,
       serial=excluded.serial,
       quantity=excluded.quantity,
       installed_year=excluded.installed_year,
       confidence=excluded.confidence,
       verification_status=excluded.verification_status,
       updated_at=excluded.updated_at`,
    [
      asset.id,
      asset.customer ?? null,
      asset.modality ?? null,
      asset.manufacturer ?? null,
      asset.model ?? null,
      asset.serial ?? null,
      Number(asset.quantity) || 1,
      Number(asset.installedYear) || null,
      Number(asset.confidence) || 0,
      asset.verificationStatus || 'UNVERIFIED',
      asset.createdAt || now,
      now
    ]
  );
}

export async function insertEvidence(evidence, fieldTrust = {}) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO evidence
      (id, asset_id, source, source_quality, uri, raw_text, engine, facts_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      evidence.id,
      evidence.assetId,
      evidence.source,
      evidence.sourceQuality ?? 0.6,
      evidence.uri ?? null,
      evidence.rawText ?? null,
      evidence.engine ?? null,
      JSON.stringify(evidence.facts || {}),
      evidence.createdAt || nowIso()
    ]
  );

  for (const [field, value] of Object.entries(evidence.facts || {})) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    await db.runAsync(
      `INSERT INTO fact_evidence (evidence_id, asset_id, field_name, field_value, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidence.id, evidence.assetId, field, String(value), fieldTrust[field]?.confidence ?? null, evidence.createdAt || nowIso()]
    );
  }
}

export async function insertHistory(item) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO history (id, asset_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)`,
    [item.id, item.assetId, item.event, item.detail ?? null, item.createdAt || nowIso()]
  );
}

export async function listAssets() {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM assets ORDER BY updated_at DESC');
  return rows.map(r => ({
    id: r.id,
    customer: r.customer,
    modality: r.modality,
    manufacturer: r.manufacturer,
    model: r.model,
    serial: r.serial,
    quantity: r.quantity,
    installedYear: r.installed_year,
    confidence: r.confidence,
    verificationStatus: r.verification_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export async function listEvidence(assetId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM evidence WHERE asset_id = ? ORDER BY created_at ASC', [assetId]);
  return rows.map(r => ({
    id: r.id,
    assetId: r.asset_id,
    source: r.source,
    sourceQuality: r.source_quality,
    uri: r.uri,
    rawText: r.raw_text,
    engine: r.engine,
    facts: JSON.parse(r.facts_json || '{}'),
    createdAt: r.created_at
  }));
}

export async function clearAllData() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM fact_evidence; DELETE FROM evidence; DELETE FROM history; DELETE FROM assets;');
}
