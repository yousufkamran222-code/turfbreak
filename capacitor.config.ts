import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yousufkamran.turfbreak',
  appName: 'Turfbreak',
  webDir: 'dist',
  backgroundColor: '#0d0f14',
  plugins: {
    // With viewport-fit=cover in index.html, the WebView draws edge-to-edge and
    // env(safe-area-inset-*) carries the real insets for the page to pad with.
    SystemBars: { insetsHandling: 'native' },
  },
};

export default config;
