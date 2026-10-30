import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {
  getAudioControls, startAudio, stopAudio,
  type AudioSessionInfo,
} from 'react-native-artss-audio';

const controls = getAudioControls();

export function useAudioSession() {
  const [session, setSession] = useState<AudioSessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef({alive: true, generation: 0});

  useEffect(() => {
    const guard = lifecycle.current;
    guard.alive = true;
    const subscription = AppState.addEventListener('change', state => {
      // System file picker and Control Center may temporarily mark the app
      // inactive while the audio session remains valid.
      if (state !== 'background') return;
      ++guard.generation;
      setSession(null);
      setBusy(false);
      void stopAudio().catch((reason: unknown) => {
        if (guard.alive) setError(reason instanceof Error ? reason.message : 'Не удалось остановить звук');
      });
    });
    return () => {
      guard.alive = false;
      ++guard.generation;
      subscription.remove();
      void stopAudio().catch(() => { /* Component has gone; native teardown also stops RemoteIO. */ });
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      if (!controls.running) {
        setSession(null);
        setError('Аудиомаршрут изменён или воспроизведение прервано. Включите звук снова.');
      }
    }, 400);
    return () => clearInterval(timer);
  }, [session]);

  async function toggleAudio() {
    if (busy) return;
    const guard = lifecycle.current;
    const request = ++guard.generation;
    setBusy(true);
    setError(null);
    try {
      if (session) {
        await stopAudio();
        if (guard.alive && request === guard.generation) setSession(null);
      } else {
        const info = await startAudio();
        if (guard.alive && request === guard.generation) setSession(info);
      }
    } catch (reason: unknown) {
      if (guard.alive && request === guard.generation) {
        setSession(null);
        setError(reason instanceof Error ? reason.message : 'Не удалось включить звук');
        await stopAudio().catch(() => undefined);
      }
    } finally {
      if (guard.alive && request === guard.generation) setBusy(false);
    }
  }

  return {controls, session, busy, error, toggleAudio};
}
