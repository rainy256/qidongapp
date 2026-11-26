import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = { appId: 'com.rainy256.qidongapp', appName: '启动！', webDir: process.env.QIDONG_PRODUCT === '1' ? 'dist-product' : 'dist', server: { androidScheme: 'https' } };
export default config;
