import {Text, StyleSheet} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN, scheduleOnUI} from 'react-native-worklets';
import type {PadIndex, RealtimeControls} from 'react-native-artss-audio';

interface Props {
  index: PadIndex;
  label: string;
  controls: RealtimeControls;
  enabled: boolean;
  onSelect: (index: PadIndex) => void;
}

export function PerformancePad({index, label, controls, enabled, onSelect}: Props) {
  const pressed = useSharedValue(0);
  const failed = useSharedValue(0);
  const gesture = Gesture.Tap()
    .enabled(enabled)
    .maxDuration(30000)
    .onBegin(() => {
      // This closure executes in the UI runtime. Audio never goes through RN JS.
      pressed.value = 1;
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      scheduleOnRN(onSelect, index);
    })
    .onFinalize(() => { pressed.value = withTiming(0, {duration: 90}); });
  const animated = useAnimatedStyle(() => ({
    transform: [{scale: 1 - pressed.value * 0.045}],
    backgroundColor: failed.value ? '#5F2731' : pressed.value > 0.1 ? '#DF233D' : '#202026',
  }));

  function accessibleTrigger() {
    onSelect(index);
    scheduleOnUI(() => {
      'worklet';
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      pressed.value = 1;
      pressed.value = withTiming(0, {duration: 140});
    });
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${label}, пэд ${index + 1}`}
        accessibilityState={{disabled: !enabled}}
        onAccessibilityTap={enabled ? accessibleTrigger : undefined}
        style={[styles.pad, !enabled && styles.disabled, animated]}>
        <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.label}>{label}</Text>
        <Text style={styles.hint}>ONE SHOT</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pad: {width: '23.2%', minHeight: 96, borderRadius: 17, padding: 11, justifyContent: 'space-between'},
  disabled: {opacity: 0.45},
  number: {color: '#97979D', fontSize: 11, fontWeight: '600'},
  label: {color: '#FFF', fontSize: 12, fontWeight: '800', marginTop: 14},
  hint: {color: '#97979D', fontSize: 7, fontWeight: '600', marginTop: 5, letterSpacing: 0.6},
});
