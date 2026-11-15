import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yousufkamran.turfbreak',
  appName: 'Turfbreak',
  webDir: 'dist',
  backgroundColor: '#0d0f14',
  android: {
    // Lets the WebView draw behind the system bars; the page handles safe-area insets.
    adjustMarginsForEdgeToEdge: 'disable',
  },
};

export default config;
