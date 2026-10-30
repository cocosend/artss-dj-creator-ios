import {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Canvas, Line, Path, Rect, Skia, vec} from '@shopify/react-native-skia';
import {useDerivedValue, useFrameCallback, useSharedValue} from 'react-native-reanimated';
import type {PadIndex, PositionKey, RealtimeControls} from 'react-native-artss-audio';

interface Props {
  controls: RealtimeControls;
  samples: readonly number[];
  pad: PadIndex;
}

export function AudioWaveform({controls, samples, pad}: Props) {
  const [width, setWidth] = useState(1);
  const position = useSharedValue(-1);
  const peak = useSharedValue(0);
  const key: PositionKey = `position${pad}`;
  useFrameCallback(() => {
    // Numeric native properties read atomics; no RN setState per frame.
    position.value = controls[key];
    peak.value = controls.peak;
  });
  const playhead = useDerivedValue(() => Math.max(0, position.value) * width);
  const playheadOpacity = useDerivedValue(() => position.value >= 0 ? 1 : 0);
  const meterWidth = useDerivedValue(() => Math.min(1, peak.value) * width);
  const path = useMemo(() => {
    const result = Skia.Path.Make();
    const step = width / Math.max(1, samples.length);
    for (let i = 0; i < samples.length; ++i) {
      const amplitude = (samples[i] ?? 0) * 39;
      const x = i * step + step / 2;
      result.moveTo(x, 48 - amplitude);
      result.lineTo(x, 48 + amplitude);
    }
    return result;
  }, [samples, width]);

  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.container}>
      <Canvas style={styles.canvas} accessible={false}>
        <Line p1={vec(0, 48)} p2={vec(width, 48)} color="#36363D" strokeWidth={1} />
        <Path path={path} color="#ECECEE" style="stroke" strokeWidth={Math.max(1, width / 192)} />
        <Rect x={playhead} y={8} width={2} height={80} color="#EF3150" opacity={playheadOpacity} />
        <Rect x={0} y={101} width={width} height={3} color="#36363D" />
        <Rect x={0} y={101} width={meterWidth} height={3} color="#EF3150" />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {height: 108, overflow: 'hidden'},
  canvas: {flex: 1},
});
