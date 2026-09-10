import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import * as Device from 'expo-device';

import { processImage } from './src/multimodal/VisionModule.js';
import { processVoice } from './src/multimodal/VoiceModule.js';
import { extractStructuredFacts, qvacHealthCheck } from './src/ai/QVACRuntime.js';
import { createEvidence, addHistoryEvent } from './src/core/AssetMemory.js';
import { orchestrate } from './src/core/AuraOrchestrator.js';
import { generateInsights } from './src/intelligence/InsightEngine.js';
import { buildCustomer360 } from './src/dashboard/Customer360.js';
import {
  clearAllData,
  getDatabase,
  insertEvidence,
  insertHistory,
  listAssets,
  upsertAsset
} from './src/database/Database.js';
import { makeId, nowIso } from './src/utils/ids.js';

const EMPTY_RESULT = {
  asset: {},
  confidence: 0,
  trust: { fields: {}, coverage: 0, agreement: 0 },
  conflicts: [],
  nextAction: 'REQUEST_EVIDENCE',
  evidenceCount: 0
};

const SOURCE_LABELS = {
  VOICE: 'Voice',
  VISIONPSY: 'VisionPsy',
  MANUAL: 'Typed note',
  DEMO: 'Demo evidence'
};

function ActionButton({ title, subtitle, onPress, disabled, tone = 'primary' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'secondary' && styles.actionSecondary,
        disabled && styles.actionDisabled,
        pressed && !disabled && { opacity: 0.82 }
      ]}
    >
      <Text style={styles.actionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
    </Pressable>
  );
}

function Pill({ text, good = false, warning = false }) {
  return (
    <View style={[styles.pill, good && styles.pillGood, warning && styles.pillWarning]}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

function FactRow({ label, field, result }) {
  const item = result.trust?.fields?.[field];
  if (!item) return null;
  return (
    <View style={styles.factRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{String(item.value)}</Text>
      </View>
      <View style={styles.factMeta}>
        <Text style={styles.factConfidence}>{item.confidence}%</Text>
        <Text style={styles.factSources}>{item.sources.join(' + ')}</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [assetId, setAssetId] = useState(() => makeId('asset'));
  const [evidence, setEvidence] = useState([]);
  const [result, setResult] = useState(EMPTY_RESULT);
  const [assets, setAssets] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastImage, setLastImage] = useState(null);
  const [manualText, setManualText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Initializing local workspace…');
  const [progress, setProgress] = useState(null);
  const [qvac, setQvac] = useState({ available: null, detail: 'Checking SDK…' });
  const [error, setError] = useState(null);

  const customer360 = useMemo(() => {
    const customer = result.asset?.customer || assets[0]?.customer || null;
    return buildCustomer360(assets, customer);
  }, [assets, result.asset?.customer]);

  const insights = useMemo(() => generateInsights(result.asset || {}), [result.asset]);

  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        const saved = await listAssets();
        setAssets(saved);
        const mic = await AudioModule.requestRecordingPermissionsAsync();
        if (mic.granted) {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        }
        const health = await qvacHealthCheck();
        setQvac(health);
        setStatus(health.available ? 'Ready. QVAC models load on first use.' : 'QVAC SDK unavailable in this runtime.');
      } catch (e) {
        setError(e?.message || String(e));
        setStatus('Initialization needs attention.');
      }
    })();
  }, []);

  function onModelStatus(update) {
    setStatus(update.message);
    setProgress(Number.isFinite(update.progress) ? update.progress : null);
  }

  async function persistEvidenceItem(item, items) {
    const orchestration = orchestrate(items, result.asset);
    const persistedAsset = {
      id: assetId,
      ...orchestration.asset,
      confidence: orchestration.confidence,
      verificationStatus: orchestration.nextAction,
      createdAt: result.asset?.createdAt || nowIso()
    };

    await upsertAsset(persistedAsset);
    await insertEvidence(item, orchestration.trust.fields);
    const history = addHistoryEvent([], assetId, `${item.source}_CAPTURED`, item.rawText || item.text || item.engine || null)[0];
    await insertHistory(history);
    const refreshed = await listAssets();
    setAssets(refreshed);
    setEvidence(items);
    setResult({ ...orchestration, asset: persistedAsset });
    return orchestration;
  }

  async function addObservation(payload) {
    const item = createEvidence({ assetId, ...payload });
    return persistEvidenceItem(item, [...evidence, item]);
  }

  async function runTypedObservation() {
    const text = manualText.trim();
    if (!text) {
      Alert.alert('Add an observation', 'Type a field observation first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const facts = await extractStructuredFacts(text, { onStatus: onModelStatus });
      await addObservation({
        source: 'MANUAL',
        sourceQuality: 0.68,
        facts,
        rawText: text,
        engine: 'QVAC VisionPsy Nano (text)'
      });
      setManualText('');
      setStatus('Typed observation structured and persisted locally.');
    } catch (e) {
      setError(e?.message || String(e));
      setStatus('QVAC text extraction failed. See error below.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setStatus('Recording field observation…');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function stopRecordingAndProcess() {
    setBusy(true);
    setError(null);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('The recorder did not return an audio file.');
      const voice = await processVoice(uri, { onStatus: onModelStatus });
      await addObservation({
        source: voice.source,
        sourceQuality: voice.sourceQuality,
        facts: voice.facts,
        uri,
        rawText: voice.text,
        engine: voice.engine
      });
      setStatus(`Voice processed locally: “${voice.text || 'No speech detected'}”`);
    } catch (e) {
      setError(`${e?.message || String(e)}\n\nTip: if your device records a codec unsupported by the QVAC speech engine, use the typed observation flow or supply a 16 kHz mono WAV recording.`);
      setStatus('Voice capture saved, but local transcription needs attention.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function openCamera() {
    setError(null);
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response.granted) return;
    }
    setCameraOpen(true);
  }

  async function captureAndProcess() {
    if (!cameraRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      setLastImage(photo.uri);
      setCameraOpen(false);
      const vision = await processImage(photo.uri, { onStatus: onModelStatus });
      await addObservation({
        source: vision.source,
        sourceQuality: vision.sourceQuality,
        facts: vision.facts,
        uri: vision.uri,
        rawText: vision.raw,
        engine: vision.engine
      });
      setStatus('VisionPsy evidence extracted and saved locally.');
    } catch (e) {
      setCameraOpen(false);
      setError(e?.message || String(e));
      setStatus('Image analysis failed. See error below.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function runDemo() {
    setBusy(true);
    setError(null);
    try {
      const demoId = makeId('asset');
      setAssetId(demoId);
      const voice = createEvidence({
        assetId: demoId,
        source: 'DEMO',
        sourceQuality: 0.72,
        facts: { customer: 'DemoCare Horizon', modality: 'MR', quantity: 3, installedYear: 2017 },
        rawText: 'Three MR systems at DemoCare Horizon, installed around 2017.',
        engine: 'Deterministic demo fixture'
      });
      const plate = createEvidence({
        assetId: demoId,
        source: 'VISIONPSY',
        sourceQuality: 0.95,
        facts: { customer: 'DemoCare Horizon', modality: 'MR', manufacturer: 'BluePeak', model: 'MR-X500', serial: 'BP88921' },
        rawText: 'Demo nameplate evidence',
        engine: 'VisionPsy demo fixture'
      });
      const items = [voice, plate];
      const orchestration = orchestrate(items, {});
      const demoAsset = {
        id: demoId,
        ...orchestration.asset,
        confidence: orchestration.confidence,
        verificationStatus: orchestration.nextAction,
        createdAt: nowIso()
      };
      await upsertAsset(demoAsset);
      await insertEvidence(voice, orchestration.trust.fields);
      await insertEvidence(plate, orchestration.trust.fields);
      await insertHistory(addHistoryEvent([], demoId, 'DEMO_PIPELINE_COMPLETED', 'Voice + plate evidence fused')[0]);
      setEvidence(items);
      setResult({ ...orchestration, asset: demoAsset });
      setAssets(await listAssets());
      setStatus('Demo pipeline completed through the same trust, conflict, DB and 360 layers.');
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetWorkspace() {
    setBusy(true);
    try {
      await clearAllData();
      const nextId = makeId('asset');
      setAssetId(nextId);
      setEvidence([]);
      setResult(EMPTY_RESULT);
      setAssets([]);
      setLastImage(null);
      setError(null);
      setStatus('Workspace cleared. Ready for a new asset.');
    } finally {
      setBusy(false);
    }
  }

  const physicalDeviceWarning = !Device.isDevice;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>AURA • LOCAL FIELD INTELLIGENCE</Text>
          <Text style={styles.title}>FieldGraph</Text>
          <Text style={styles.subtitle}>Evidence → Trust → Customer 360 → Lifecycle insight</Text>
          <View style={styles.heroPills}>
            <Pill text={qvac.available === true ? 'QVAC SDK READY' : qvac.available === false ? 'QVAC CHECK FAILED' : 'CHECKING QVAC'} good={qvac.available === true} warning={qvac.available === false} />
            <Pill text={`${evidence.length} evidence`} />
            <Pill text={`${result.confidence || 0}% trust`} good={result.confidence >= 80} />
          </View>
        </View>

        {physicalDeviceWarning ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Physical device required for QVAC inference</Text>
            <Text style={styles.warningText}>The UI can render here, but QVAC's native llama.cpp runtime must be tested on a real Android/iOS device.</Text>
          </View>
        ) : null}

        <View style={styles.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionKicker}>SYSTEM</Text>
            <Text style={styles.statusText}>{status}</Text>
            <Text style={styles.statusDetail}>{qvac.detail}</Text>
          </View>
          {busy ? <ActivityIndicator size="small" /> : null}
        </View>
        {progress !== null ? (
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, Math.min(100, progress))}%` }]} /></View>
        ) : null}

        <Text style={styles.sectionTitle}>Capture intelligence</Text>
        <View style={styles.grid}>
          <ActionButton
            title={recorderState.isRecording ? 'Stop & analyze voice' : 'Record voice'}
            subtitle={recorderState.isRecording ? `${Math.round((recorderState.durationMillis || 0) / 1000)} sec` : 'QVAC speech → structured facts'}
            onPress={recorderState.isRecording ? stopRecordingAndProcess : startRecording}
            disabled={busy}
          />
          <ActionButton
            title="Scan equipment"
            subtitle="Camera → VisionPsy Nano"
            onPress={openCamera}
            disabled={busy}
          />
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.sectionKicker}>TEXT FALLBACK / FAST TEST</Text>
          <TextInput
            style={styles.input}
            multiline
            value={manualText}
            onChangeText={setManualText}
            placeholder="Example: DemoCare Horizon has three MR systems installed around 2017."
            placeholderTextColor="#697386"
          />
          <ActionButton title="Analyze typed observation with QVAC" onPress={runTypedObservation} disabled={busy} tone="secondary" />
        </View>

        <ActionButton title="Run deterministic showstopper demo" subtitle="Exercises fusion, trust, DB, Customer 360 and insights without model downloads" onPress={runDemo} disabled={busy} tone="secondary" />

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Runtime error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {lastImage ? (
          <View style={styles.card}>
            <Text style={styles.sectionKicker}>LATEST VISUAL EVIDENCE</Text>
            <Image source={{ uri: lastImage }} style={styles.preview} />
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.sectionKicker}>CURRENT ASSET</Text>
              <Text style={styles.cardTitle}>{result.asset?.model || result.asset?.modality || 'Awaiting evidence'}</Text>
            </View>
            <View style={styles.scoreBubble}>
              <Text style={styles.score}>{result.confidence || 0}</Text>
              <Text style={styles.scoreLabel}>TRUST</Text>
            </View>
          </View>
          <FactRow label="Customer" field="customer" result={result} />
          <FactRow label="Modality" field="modality" result={result} />
          <FactRow label="Manufacturer" field="manufacturer" result={result} />
          <FactRow label="Model" field="model" result={result} />
          <FactRow label="Serial" field="serial" result={result} />
          <FactRow label="Quantity" field="quantity" result={result} />
          <FactRow label="Installed year" field="installedYear" result={result} />
          <View style={styles.metricsRow}>
            <Text style={styles.metric}>Coverage {result.trust?.coverage || 0}%</Text>
            <Text style={styles.metric}>Agreement {result.trust?.agreement || 0}%</Text>
            <Text style={styles.metric}>{result.nextAction}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionKicker}>EVIDENCE GRAPH</Text>
          <Text style={styles.cardTitle}>{evidence.length ? `${evidence.length} sources linked to ${assetId}` : 'No evidence captured yet'}</Text>
          {evidence.map(item => (
            <View key={item.id} style={styles.evidenceRow}>
              <View style={styles.nodeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.evidenceSource}>{SOURCE_LABELS[item.source] || item.source} • {item.engine || 'local'}</Text>
                <Text style={styles.evidenceFacts}>{Object.entries(item.facts || {}).filter(([, v]) => v !== null && v !== undefined && String(v) !== '').map(([k, v]) => `${k}: ${v}`).join('  ·  ') || 'No structured facts'}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionKicker}>CONFLICT ENGINE</Text>
          {result.conflicts?.length ? result.conflicts.map((conflict, idx) => (
            <View key={`${conflict.field}_${idx}`} style={styles.conflictRow}>
              <Text style={styles.conflictTitle}>{conflict.field}</Text>
              <Text style={styles.conflictText}>{conflict.values.map(v => `${v.source}: ${v.value}`).join(' vs ')}</Text>
            </View>
          )) : <Text style={styles.goodText}>No same-asset field conflicts detected.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionKicker}>CUSTOMER 360</Text>
          <Text style={styles.cardTitle}>{customer360.name}</Text>
          <Text style={styles.bigNumber}>{customer360.assets}</Text>
          <Text style={styles.muted}>persisted assets • avg trust {customer360.averageConfidence}%</Text>
          <View style={styles.modalityWrap}>
            {Object.entries(customer360.installedBase).map(([name, qty]) => <Pill key={name} text={`${name} ${qty}`} good />)}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionKicker}>LIFECYCLE INSIGHTS</Text>
          {insights.map((insight, idx) => (
            <View key={`${insight.type}_${idx}`} style={styles.insightRow}>
              <Pill text={insight.priority.toUpperCase()} warning={insight.priority === 'high' || insight.priority === 'critical'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightText}>{insight.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable onPress={resetWorkspace} disabled={busy} style={styles.resetButton}>
          <Text style={styles.resetText}>Clear local demo data</Text>
        </Pressable>
        <Text style={styles.footer}>AURA FieldGraph v14 • local-first • evidence-backed</Text>
      </ScrollView>

      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
        <View style={styles.cameraScreen}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setStatus('Camera ready. Center the equipment nameplate.')} />
          <View style={styles.cameraOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.cameraHint}>Center the equipment or serial plate</Text>
            <View style={styles.cameraActions}>
              <Pressable style={styles.cameraCancel} onPress={() => setCameraOpen(false)}><Text style={styles.cameraButtonText}>Cancel</Text></Pressable>
              <Pressable style={styles.shutter} onPress={captureAndProcess}><View style={styles.shutterInner} /></Pressable>
              <View style={{ width: 74 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#071018' },
  container: { padding: 18, paddingBottom: 48, gap: 14 },
  hero: { paddingTop: 14, paddingBottom: 10 },
  eyebrow: { color: '#55D6BE', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: '#F7FAFC', fontSize: 42, lineHeight: 46, fontWeight: '900', letterSpacing: -1.4 },
  subtitle: { color: '#A7B3C4', fontSize: 15, lineHeight: 21, marginTop: 5 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  pill: { backgroundColor: '#182431', borderWidth: 1, borderColor: '#263747', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 },
  pillGood: { backgroundColor: '#0E302B', borderColor: '#1D6B5D' },
  pillWarning: { backgroundColor: '#3A2816', borderColor: '#7A5427' },
  pillText: { color: '#D6E0EB', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  warningCard: { backgroundColor: '#332817', borderColor: '#6B5426', borderWidth: 1, borderRadius: 14, padding: 14 },
  warningTitle: { color: '#FFD38A', fontSize: 14, fontWeight: '800' },
  warningText: { color: '#D6C6A7', fontSize: 12, lineHeight: 18, marginTop: 4 },
  statusCard: { backgroundColor: '#0C1822', borderColor: '#1C2C3A', borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
  sectionKicker: { color: '#6F8499', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 5 },
  statusText: { color: '#E7EEF6', fontSize: 13, fontWeight: '700' },
  statusDetail: { color: '#7F91A4', fontSize: 11, marginTop: 3 },
  progressTrack: { height: 4, backgroundColor: '#14222E', borderRadius: 20, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#55D6BE', borderRadius: 20 },
  sectionTitle: { color: '#EEF4F8', fontSize: 18, fontWeight: '800', marginTop: 4 },
  grid: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, minHeight: 76, justifyContent: 'center', backgroundColor: '#123A43', borderColor: '#1B6973', borderWidth: 1, borderRadius: 16, padding: 13 },
  actionSecondary: { backgroundColor: '#101C28', borderColor: '#283C4D' },
  actionDisabled: { opacity: 0.45 },
  actionTitle: { color: '#F4FAFC', fontSize: 14, fontWeight: '800' },
  actionSubtitle: { color: '#91A5B6', fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  inputCard: { backgroundColor: '#0C1822', borderWidth: 1, borderColor: '#1C2C3A', borderRadius: 16, padding: 13, gap: 10 },
  input: { color: '#EDF3F8', backgroundColor: '#08131C', borderColor: '#1A2B38', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 78, textAlignVertical: 'top' },
  errorCard: { backgroundColor: '#351B22', borderColor: '#743447', borderWidth: 1, borderRadius: 14, padding: 14 },
  errorTitle: { color: '#FF9CB3', fontWeight: '900', fontSize: 13 },
  errorText: { color: '#F0BEC9', fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  card: { backgroundColor: '#0C1822', borderColor: '#1C2C3A', borderWidth: 1, borderRadius: 18, padding: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardTitle: { color: '#F0F5F8', fontSize: 20, fontWeight: '800' },
  scoreBubble: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#0D302B', borderWidth: 1, borderColor: '#1D6B5D', alignItems: 'center', justifyContent: 'center' },
  score: { color: '#71E6CE', fontSize: 20, fontWeight: '900' },
  scoreLabel: { color: '#6FA99F', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  factRow: { flexDirection: 'row', borderTopColor: '#162735', borderTopWidth: 1, paddingVertical: 10, alignItems: 'center' },
  factLabel: { color: '#70869B', fontSize: 10, textTransform: 'uppercase', fontWeight: '800' },
  factValue: { color: '#EBF1F5', fontSize: 14, fontWeight: '700', marginTop: 2 },
  factMeta: { maxWidth: '45%', alignItems: 'flex-end' },
  factConfidence: { color: '#55D6BE', fontSize: 12, fontWeight: '900' },
  factSources: { color: '#667B8D', fontSize: 9, textAlign: 'right', marginTop: 2 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  metric: { color: '#889DAF', backgroundColor: '#111F2A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '700' },
  preview: { width: '100%', aspectRatio: 1.5, borderRadius: 12, marginTop: 7, backgroundColor: '#08131C' },
  evidenceRow: { flexDirection: 'row', gap: 10, borderTopColor: '#162735', borderTopWidth: 1, paddingVertical: 11 },
  nodeDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#55D6BE', marginTop: 4 },
  evidenceSource: { color: '#DCE7EF', fontSize: 12, fontWeight: '800' },
  evidenceFacts: { color: '#7890A3', fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  conflictRow: { backgroundColor: '#302117', borderRadius: 11, padding: 10, marginTop: 7 },
  conflictTitle: { color: '#FFCE85', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  conflictText: { color: '#D6B98C', fontSize: 11, lineHeight: 16, marginTop: 3 },
  goodText: { color: '#71CBB7', fontSize: 12, lineHeight: 18 },
  bigNumber: { color: '#F5FAFC', fontSize: 38, fontWeight: '900', marginTop: 8 },
  muted: { color: '#718799', fontSize: 11 },
  modalityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderTopColor: '#162735', borderTopWidth: 1, paddingVertical: 11 },
  insightTitle: { color: '#EAF1F5', fontSize: 13, fontWeight: '800' },
  insightText: { color: '#7D91A3', fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  resetButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  resetText: { color: '#718699', fontSize: 11, textDecorationLine: 'underline' },
  footer: { color: '#42586B', textAlign: 'center', fontSize: 10, marginTop: 2 },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { flex: 1, justifyContent: 'flex-end', padding: 24, backgroundColor: 'rgba(0,0,0,0.08)' },
  scanFrame: { position: 'absolute', top: '24%', left: '10%', right: '10%', height: '32%', borderWidth: 2, borderColor: '#71E6CE', borderRadius: 18 },
  cameraHint: { color: '#FFF', textAlign: 'center', fontSize: 14, fontWeight: '800', marginBottom: 28, textShadowColor: '#000', textShadowRadius: 5 },
  cameraActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 },
  cameraCancel: { width: 74, paddingVertical: 12 },
  cameraButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' }
});
