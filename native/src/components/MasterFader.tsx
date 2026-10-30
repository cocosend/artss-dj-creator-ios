import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {scheduleOnUI} from 'react-native-worklets';
import type {RealtimeControls} from 'react-native-artss-audio';

export function MasterFader({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [width, setWidth] = useState(1);
  const gain = useSharedValue(0.75);
  const available = Math.max(1, width - 44);
  const gesture = Gesture.Pan().enabled(enabled).minDistance(0)
    .onBegin(event => {
      const next = Math.max(0, Math.min(1, (event.x - 22) / available));
      if (controls.setMaster(next)) gain.value = next;
    })
    .onUpdate(event => {
      const next = Math.max(0, Math.min(1, (event.x - 22) / available));
      if (controls.setMaster(next)) gain.value = next;
    });
  const fill = useAnimatedStyle(() => ({width: gain.value * available}));
  const thumb = useAnimatedStyle(() => ({transform: [{translateX: gain.value * available}]}));

  function adjust(delta: number) {
    scheduleOnUI(() => {
      'worklet';
      const next = Math.max(0, Math.min(1, gain.value + delta));
      if (controls.setMaster(next)) gain.value = next;
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.labels}><Text style={styles.title}>MASTER</Text><Text style={styles.hint}>Громкость</Text></View>
      <GestureDetector gesture={gesture}>
        <View
          accessible accessibilityRole="adjustable" accessibilityLabel="Основная громкость"
          accessibilityState={{disabled: !enabled}}
          accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
          onAccessibilityAction={event => { if (enabled) adjust(event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05); }}
          onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.trackTouch}>
          <View style={styles.track}><Animated.View style={[styles.fill, fill]} /></View>
          <Animated.View style={[styles.thumb, thumb]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {marginTop: 25},
  labels: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2},
  title: {color: '#18181C', fontWeight: '800', fontSize: 11, letterSpacing: 1.2},
  hint: {color: '#7A7A82', fontSize: 11},
  trackTouch: {height: 60, justifyContent: 'center'},
  track: {height: 5, backgroundColor: '#D9D9DD', borderRadius: 3, marginHorizontal: 22},
  fill: {height: 5, backgroundColor: '#DF233D', borderRadius: 3},
  thumb: {position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181C', borderWidth: 5, borderColor: '#F3F2EF'},
});
