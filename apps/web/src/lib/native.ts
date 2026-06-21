import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (iOS/Android), false on web. */
export const isNative = Capacitor.isNativePlatform();

/** The platform: 'ios' | 'android' | 'web'. */
export const platform = Capacitor.getPlatform();
