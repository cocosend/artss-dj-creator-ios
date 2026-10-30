import {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Canvas, Path, Rect, Skia} from '@shopify/react-native-skia';
import {useDerivedValue, useFrameCallback, useSharedValue} from 'react-native-reanimated';
import {loadPreset, pickTrack, type RealtimeControls, type TrackInfo} from 'react-native-artss-audio';
import {useAudioSession} from './audio/useAudioSession';

type DeckIndex = 0 | 1;
const COLORS = ['#33E7FC', '#FF4569'] as const;
const PRESETS = [
  {name: 'Maddix', genre: 'PEAK TECHNO', bpm: 145}, {name: 'ARTBAT', genre: 'MELODIC', bpm: 124},
  {name: 'Brejcha', genre: 'MINIMAL', bpm: 126}, {name: 'Guetta', genre: 'DANCE', bpm: 128},
  {name: 'Kazantip', genre: 'RAVE', bpm: 138}, {name: 'Legends', genre: 'CLASSIC', bpm: 130},
  {name: 'Modern', genre: 'FUTURE', bpm: 132},
] as const;
const EMPTY = Object.freeze(new Array<number>(96).fill(0));

function time(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function WaveStrip({deck, controls, track, color}: {deck: DeckIndex; controls: RealtimeControls; track: TrackInfo | null; color: string}) {
  const [width, setWidth] = useState(1);
  const progress = useSharedValue(0);
  useFrameCallback(() => { progress.value = deck === 0 ? controls.deckPosition0 : controls.deckPosition1; });
  const playhead = useDerivedValue(() => progress.value * width);
  const path = useMemo(() => {
    const result = Skia.Path.Make();
    (track?.waveform ?? EMPTY).forEach((peak, index) => {
      const x = (index + 0.5) * width / 96;
      const h = Math.max(1, peak * 33);
      result.moveTo(x, 38 - h);
      result.lineTo(x, 38 + h);
    });
    return result;
  }, [track, width]);
  const seek = Gesture.Pan().minDistance(0).onUpdate(event => {
    'worklet';
    progress.value = Math.max(0, Math.min(1, event.x / width));
  }).onEnd(event => {
    'worklet';
    controls.deckSeek(deck, Math.max(0, Math.min(0.9999, event.x / width)));
  });
  return <GestureDetector gesture={seek}><View onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={styles.wave}>
    <Canvas style={styles.canvas} accessible={false}>
      <Path path={path} style="stroke" strokeWidth={Math.max(1.3, width / 110)} color={color} />
      <Rect x={playhead} y={2} width={2} height={72} color="#FFFFFF" />
    </Canvas>
  </View></GestureDetector>;
}

function Key({label, onPress, active, disabled, accent}: {label: string; onPress: () => void; active?: boolean; disabled?: boolean; accent?: string}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled, selected: active}} disabled={disabled}
    onPress={onPress} style={[styles.key, active && {borderColor: accent ?? '#FFFFFF', backgroundColor: '#26333E'}, disabled && styles.disabled]}>
    <Text style={[styles.keyText, active && {color: accent ?? '#FFFFFF'}]}>{label}</Text>
  </Pressable>;
}

function Deck({index, controls, enabled, track, loading, load, position, playing}: {
  index: DeckIndex; controls: RealtimeControls; enabled: boolean; track: TrackInfo | null;
  loading: boolean; load: () => void; position: number; playing: boolean;
}) {
  const [rate, setRate] = useState(1);
  const [cue, setCue] = useState(0);
  const [loop, setLoop] = useState(0);
  const previousTrack = useRef<TrackInfo | null>(null);
  useEffect(() => {
    if (previousTrack.current !== track) {
      previousTrack.current = track;
      setRate(1); setCue(0); setLoop(0);
    }
  }, [track]);
  const color = COLORS[index];
  const ready = enabled && !!track && !loading;
  function toggle() { if (ready) controls.deckPlay(index, !playing); }
  function cueAction() {
    if (!ready) return;
    if (playing) { controls.deckPlay(index, false); controls.deckSeek(index, cue); }
    else { setCue(position); controls.deckSeek(index, position); }
  }
  function setLoopBeats(beats: number) {
    if (!ready || !track) return;
    if (loop === beats) { controls.deckLoop(index, 0, 1); setLoop(0); return; }
    // Without analyzed BPM, loop length uses the current tempo chosen by the performer.
    const span = Math.min(1, beats * 60 / (120 * track.duration) / rate);
    const start = Math.min(position, 1 - span);
    controls.deckLoop(index, start, start + span);
    setLoop(beats);
  }
  function changeRate(delta: number) {
    const next = Math.min(1.5, Math.max(0.5, Math.round((rate + delta) * 100) / 100));
    if (ready && controls.deckRate(index, next)) setRate(next);
  }
  return <View style={[styles.deck, {borderTopColor: color}]}>
    <View style={styles.deckHeading}><View style={[styles.letter, {backgroundColor: color}]}><Text style={styles.letterText}>{index === 0 ? 'A' : 'B'}</Text></View>
      <Text style={styles.deckLabel}>DECK {index === 0 ? 'A' : 'B'}</Text><Text style={[styles.status, {color}]}>{playing ? '● LIVE' : '○ READY'}</Text></View>
    <Pressable onPress={load} disabled={!enabled || loading} style={[styles.load, !enabled && styles.disabled]}>
      {loading ? <ActivityIndicator color={color} /> : <Text numberOfLines={2} style={styles.track}>{track?.title ?? '＋  ЗАГРУЗИТЬ ТРЕК'}</Text>}
      <Text style={styles.loadHint}>{track ? `${time(track.duration)}  ·  ЗАМЕНИТЬ ↗` : 'СВОЙ ФАЙЛ В ДЕКУ'}</Text>
    </Pressable>
    <WaveStrip deck={index} controls={controls} track={track} color={color} />
    <View style={styles.timeline}><Text style={styles.time}>{time(position * (track?.duration ?? 0))}</Text><Text style={styles.time}>−{time((1 - position) * (track?.duration ?? 0))}</Text></View>
    <View style={styles.transport}><Key label="CUE" onPress={cueAction} disabled={!ready} accent={color} />
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Воспроизвести'} disabled={!ready} onPress={toggle}
        style={[styles.play, {backgroundColor: color}, !ready && styles.disabled]}><Text style={styles.playText}>{playing ? 'Ⅱ' : '▶'}</Text></Pressable></View>
    <Text style={styles.caption}>TEMPO</Text>
    <View style={styles.tempo}><Key label="−" onPress={() => changeRate(-0.01)} disabled={!ready} /><Text style={styles.rate}>{Math.round((rate - 1) * 100) >= 0 ? '+' : ''}{Math.round((rate - 1) * 100)}%</Text><Key label="＋" onPress={() => changeRate(0.01)} disabled={!ready} /></View>
    <View style={styles.loopRow}><Text style={styles.caption}>LOOP · 120 BPM</Text><Key label={loop ? '4 / OFF' : '4 BEATS'} active={loop !== 0} accent={color} disabled={!ready} onPress={() => setLoopBeats(4)} /></View>
  </View>;
}

function Crossfader({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [width, setWidth] = useState(1);
  const value = useSharedValue(0.5);
  const thumb = useDerivedValue(() => value.value * Math.max(0, width - 24));
  const gesture = Gesture.Pan().minDistance(0).onUpdate(event => {
    'worklet';
    if (!enabled) return;
    const next = Math.max(0, Math.min(1, event.x / width));
    value.value = next;
    controls.crossfade(next);
  });
  return <View style={styles.mixer}><View style={styles.mixHeading}><Text style={[styles.mixLetter, {color: COLORS[0]}]}>A</Text><Text style={styles.mixTitle}>CROSSFADER</Text><Text style={[styles.mixLetter, {color: COLORS[1]}]}>B</Text></View>
    <GestureDetector gesture={gesture}><View style={styles.faderTouch} onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
      <View style={styles.faderRail} /><Canvas style={styles.faderCanvas} accessible={false}><Rect x={thumb} y={5} width={24} height={42} color="#F6F9FF" /></Canvas>
    </View></GestureDetector></View>;
}

function Studio() {
  const {controls, session, busy, error, toggleAudio} = useAudioSession();
  const [tracks, setTracks] = useState<[TrackInfo | null, TrackInfo | null]>([null, null]);
  const [loading, setLoading] = useState<DeckIndex | null>(null);
  const loadingLock = useRef(false);
  const [selected, setSelected] = useState<DeckIndex>(0);
  const [playback, setPlayback] = useState({positions: [0, 0], playing: [false, false]});
  const {width} = useWindowDimensions();
  useEffect(() => {
    const id = setInterval(() => setPlayback({positions: [controls.deckPosition0, controls.deckPosition1],
      playing: [controls.deckPlaying0, controls.deckPlaying1]}), 200);
    return () => clearInterval(id);
  }, [controls]);
  useEffect(() => { if (!session) setTracks([null, null]); }, [session]);
  const [importError, setImportError] = useState<string | null>(null);
  async function load(index: DeckIndex, preset?: number) {
    if (loadingLock.current) return;
    if (!session) { setImportError('Сначала включите звук'); return; }
    loadingLock.current = true;
    setLoading(index); setImportError(null);
    try {
      const track = preset === undefined ? await pickTrack(index) : await loadPreset(index, preset);
      setTracks(previous => { const next = [...previous] as [TrackInfo | null, TrackInfo | null]; next[index] = track; return next; });
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Не удалось загрузить трек';
      if (!message.includes('отменён')) setImportError(message);
    } finally { loadingLock.current = false; setLoading(null); }
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}><StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={[styles.content, {maxWidth: width > 800 ? 760 : 540}]} bounces={false}>
      <View style={styles.header}><View><Text style={styles.sub}>ARTSS / PERFORMANCE</Text><Text style={styles.brand}>DJ <Text style={styles.brandAccent}>CREATOR</Text></Text></View>
        <Pressable accessibilityRole="button" onPress={() => { void toggleAudio(); }} disabled={busy} style={[styles.power, session && styles.powerOn]}>
          <Text style={styles.powerText}>{busy ? '…' : session ? '● ON' : '◯ AUDIO'}</Text></Pressable></View>
      <View style={styles.libraryHead}><View><Text style={styles.eyebrow}>01 / MUSIC LIBRARY</Text><Text style={styles.sectionTitle}>Начни с трека</Text></View>
        <View style={styles.target}><Text style={styles.targetLabel}>В ДЕКУ</Text>{([0, 1] as const).map(index => <Pressable key={index}
          accessibilityRole="button" accessibilityState={{selected: selected === index}} onPress={() => setSelected(index)}
          style={[styles.targetButton, selected === index && {backgroundColor: COLORS[index]}]}><Text style={[styles.targetText, selected === index && styles.targetTextOn]}>{index === 0 ? 'A' : 'B'}</Text></Pressable>)}</View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll} contentContainerStyle={styles.presetList}>
        {PRESETS.map((preset, index) => <Pressable key={preset.name} accessibilityRole="button"
          accessibilityLabel={`Загрузить демолуп ${preset.name} в деку ${selected === 0 ? 'A' : 'B'}`}
          disabled={loading !== null} onPress={() => { void load(selected, index); }} style={[styles.preset, loading !== null && styles.disabled]}>
          <Text style={styles.presetIndex}>{String(index + 1).padStart(2, '0')} / DEMO</Text>
          <Text style={styles.presetName}>{preset.name}</Text><View style={styles.presetBottom}><Text style={styles.presetGenre}>{preset.genre}</Text><Text style={styles.presetBpm}>{preset.bpm} BPM</Text></View>
        </Pressable>)}</ScrollView>
      <Pressable accessibilityRole="button" disabled={loading !== null} onPress={() => { void load(selected); }} style={[styles.import, loading !== null && styles.disabled]}>
        <Text style={styles.importIcon}>＋</Text><View style={styles.importText}><Text style={styles.importTitle}>Загрузить свой трек</Text>
          <Text style={styles.importHint}>Файлы iPhone · дека {selected === 0 ? 'A' : 'B'}</Text></View><Text style={styles.importArrow}>↗</Text></Pressable>
      <View style={styles.mixHeader}><Text style={styles.eyebrow}>02 / MIX STATION</Text><Text style={styles.mixNote}>ДВА КАНАЛА · ОДИН МИКС</Text></View>
      <View style={styles.deckRow}>{([0, 1] as const).map(index => <Deck key={index} index={index} controls={controls} enabled={!!session && !busy} track={tracks[index]}
        loading={loading === index} load={() => { void load(index); }} position={playback.positions[index] ?? 0} playing={playback.playing[index] ?? false} />)}</View>
      <Crossfader controls={controls} enabled={!!session} />
      {error || importError ? <Text accessibilityRole="alert" style={styles.error}>{error ?? importError}</Text> : null}
      <Text style={styles.footer}>{session ? `${session.routes.join(' · ')}  ·  ${session.ioBufferMs.toFixed(1)} ms` : 'Включите звук, загрузите два трека и начните сведение'}</Text>
    </ScrollView></SafeAreaView>;
}

export default function App() {
  return <GestureHandlerRootView style={{flex: 1}}><SafeAreaProvider><Studio /></SafeAreaProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#070A10'}, content: {padding: 14, paddingBottom: 34, width: '100%', alignSelf: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 27, gap: 8},
  brand: {fontSize: 27, fontWeight: '900', letterSpacing: -1, color: '#FFFFFF', marginTop: 4}, brandAccent: {color: '#33E7FC'},
  sub: {fontSize: 9, letterSpacing: 2, color: '#8D9BAE', fontWeight: '800'},
  power: {paddingHorizontal: 12, height: 38, justifyContent: 'center', borderRadius: 19, backgroundColor: '#26303F'},
  powerOn: {backgroundColor: '#1B564D'}, powerText: {fontSize: 9, fontWeight: '800', color: '#FFFFFF'},
  eyebrow: {fontSize: 9, letterSpacing: 1.7, fontWeight: '900', color: '#8D9BAE'},
  sectionTitle: {color: '#F7FAFF', fontSize: 23, fontWeight: '900', marginTop: 5, letterSpacing: -0.7},
  libraryHead: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14},
  target: {flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, padding: 4, backgroundColor: '#1A2331'},
  targetLabel: {fontSize: 8, fontWeight: '900', color: '#A3B1C3', marginHorizontal: 4},
  targetButton: {height: 29, width: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center'},
  targetText: {color: '#B4C4D5', fontWeight: '900', fontSize: 12}, targetTextOn: {color: '#071018'},
  presetScroll: {marginHorizontal: -14}, presetList: {paddingHorizontal: 14, gap: 9},
  preset: {width: 146, height: 122, borderRadius: 14, borderWidth: 1, borderColor: '#314158', backgroundColor: '#152031', padding: 12, justifyContent: 'space-between'},
  presetIndex: {color: '#33E7FC', fontSize: 9, fontWeight: '900', letterSpacing: 1.2},
  presetName: {color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.5},
  presetBottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  presetGenre: {color: '#ABB9CB', fontSize: 8, fontWeight: '800'}, presetBpm: {color: '#FFCA56', fontSize: 9, fontWeight: '900'},
  import: {height: 66, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#496179', backgroundColor: '#1C293B', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14},
  importIcon: {color: '#33E7FC', fontSize: 29, marginRight: 12}, importText: {flex: 1},
  importTitle: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'}, importHint: {color: '#A5B4C6', fontSize: 10, marginTop: 4}, importArrow: {color: '#FFFFFF', fontSize: 20},
  mixHeader: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 27, marginBottom: 12},
  mixNote: {color: '#8193A8', fontSize: 8, fontWeight: '900'},
  deckRow: {flexDirection: 'row', gap: 8}, deck: {flex: 1, minWidth: 0, borderTopWidth: 4, borderRadius: 12, padding: 9, backgroundColor: '#131E2C'},
  deckHeading: {flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26},
  letter: {width: 23, height: 23, borderRadius: 5, alignItems: 'center', justifyContent: 'center'}, letterText: {fontSize: 13, fontWeight: '900', color: '#071018'},
  deckLabel: {fontSize: 10, fontWeight: '900', color: '#F6F9FF', flex: 1}, status: {fontSize: 7, fontWeight: '700'},
  load: {height: 62, justifyContent: 'center', marginTop: 8, padding: 9, backgroundColor: '#263549', borderRadius: 8},
  track: {fontSize: 11, fontWeight: '800', color: '#F7F8FA'}, loadHint: {fontSize: 8, color: '#9DAABA', marginTop: 4, letterSpacing: 0.4},
  wave: {marginTop: 9, height: 86, borderRadius: 5, overflow: 'hidden', backgroundColor: '#080F1A'}, canvas: {flex: 1},
  timeline: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5}, time: {color: '#B1BDCC', fontSize: 9, fontVariant: ['tabular-nums']},
  transport: {flexDirection: 'row', gap: 7, marginTop: 6}, key: {flex: 1, minWidth: 0, height: 34, justifyContent: 'center', alignItems: 'center', backgroundColor: '#27303E', borderWidth: 1, borderColor: '#394454', borderRadius: 7},
  keyText: {fontSize: 11, fontWeight: '800', color: '#E4ECF6'}, play: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7},
  playText: {fontSize: 19, fontWeight: '900', color: '#071018'}, caption: {fontSize: 8, fontWeight: '800', letterSpacing: 1.2, color: '#95A6B8', marginTop: 16, marginBottom: 6},
  tempo: {flexDirection: 'row', alignItems: 'center', gap: 4}, rate: {fontSize: 11, width: 38, textAlign: 'center', color: '#F6F9FF', fontWeight: '800'},
  loopRow: {flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7}, disabled: {opacity: 0.38},
  mixer: {marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#172332'}, mixHeading: {flexDirection: 'row', justifyContent: 'space-between'},
  mixLetter: {fontSize: 15, fontWeight: '900'}, mixTitle: {fontSize: 9, color: '#B9C8D8', fontWeight: '800', letterSpacing: 1.6},
  faderTouch: {height: 54, justifyContent: 'center', marginTop: 8}, faderRail: {height: 5, marginHorizontal: 12, backgroundColor: '#3B4657', borderRadius: 3},
  faderCanvas: {...StyleSheet.absoluteFillObject}, error: {color: '#FF8397', padding: 10, fontSize: 12},
  footer: {marginTop: 18, textAlign: 'center', color: '#7F91A5', fontSize: 10},
});
