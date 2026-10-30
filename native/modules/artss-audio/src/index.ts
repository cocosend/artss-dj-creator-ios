import NativeArtssAudio from './NativeArtssAudio';

export type PadIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PositionKey = `position${PadIndex}`;

export interface RealtimeControls {
  readonly running: boolean;
  readonly peak: number;
  readonly frames: number;
  readonly droppedCommands: number;
  readonly renderOverruns: number;
  readonly maximumRenderMs: number;
  readonly invalidBuffers: number;
  readonly position0: number;
  readonly position1: number;
  readonly position2: number;
  readonly position3: number;
  readonly position4: number;
  readonly position5: number;
  readonly position6: number;
  readonly position7: number;
  readonly deckPosition0: number;
  readonly deckPosition1: number;
  readonly deckPlaying0: boolean;
  readonly deckPlaying1: boolean;
  deckPlay(deck: 0 | 1, play: boolean): boolean;
  deckSeek(deck: 0 | 1, position: number): boolean;
  deckRate(deck: 0 | 1, rate: number): boolean;
  deckLoop(deck: 0 | 1, start: number, end: number): boolean;
  crossfade(position: number): boolean;
  trigger(pad: PadIndex, velocity: number): boolean;
  setMaster(gain: number): boolean;
  allNotesOff(): boolean;
}

export interface AudioSessionInfo {
  readonly sampleRate: number;
  readonly ioBufferMs: number;
  readonly outputLatencyMs: number;
  readonly wireless: boolean;
  readonly routes: readonly string[];
  readonly waveforms: readonly (readonly number[])[];
}

let controls: RealtimeControls | undefined;
export function getAudioControls(): RealtimeControls {
  controls ??= NativeArtssAudio.getControls() as unknown as RealtimeControls;
  return controls;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSession(json: string): AudioSessionInfo {
  const value: unknown = JSON.parse(json);
  if (
    !isRecord(value) || typeof value.sampleRate !== 'number' ||
    !Number.isFinite(value.sampleRate) || value.sampleRate < 8000 ||
    typeof value.ioBufferMs !== 'number' || !Number.isFinite(value.ioBufferMs) || value.ioBufferMs <= 0 ||
    typeof value.outputLatencyMs !== 'number' || !Number.isFinite(value.outputLatencyMs) || value.outputLatencyMs < 0 ||
    typeof value.wireless !== 'boolean' ||
    !Array.isArray(value.routes) || !value.routes.every((route: unknown) => typeof route === 'string') ||
    !Array.isArray(value.waveforms) || value.waveforms.length !== 8 ||
    !value.waveforms.every((waveform: unknown) => Array.isArray(waveform) && waveform.length === 96 &&
      waveform.every((peak: unknown) => typeof peak === 'number' && Number.isFinite(peak) && peak >= 0 && peak <= 1))
  ) {
    throw new Error('Некорректные данные аудиодвижка');
  }
  return value as unknown as AudioSessionInfo;
}

export async function startAudio(): Promise<AudioSessionInfo> {
  return parseSession(await NativeArtssAudio.start());
}

export async function stopAudio(): Promise<void> {
  await NativeArtssAudio.stop();
}

export interface TrackInfo {
  readonly title: string;
  readonly duration: number;
  readonly waveform: readonly number[];
}

export async function pickTrack(deck: 0 | 1): Promise<TrackInfo> {
  return parseTrack(await NativeArtssAudio.pickTrack(deck));
}

export async function loadPreset(deck: 0 | 1, preset: number): Promise<TrackInfo> {
  if (!Number.isInteger(preset) || preset < 0 || preset > 6) throw new Error('Неизвестный пресет');
  return parseTrack(await NativeArtssAudio.loadPreset(deck, preset));
}

function parseTrack(json: string): TrackInfo {
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw) || typeof raw.title !== 'string' || typeof raw.duration !== 'number' ||
      !Number.isFinite(raw.duration) || raw.duration <= 0 || !Array.isArray(raw.waveform) ||
      raw.waveform.length !== 96 || !raw.waveform.every((value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Некорректные данные трека');
  }
  return raw as unknown as TrackInfo;
}
