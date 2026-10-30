import { TurboModuleRegistry, type TurboModule } from 'react-native';
import type {UnsafeObject} from 'react-native/Libraries/Types/CodegenTypes';

export interface Spec extends TurboModule {
  getControls(): UnsafeObject;
  start(): Promise<string>;
  stop(): Promise<void>;
  pickTrack(deck: number): Promise<string>;
  loadPreset(deck: number, preset: number): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeArtssAudio');
