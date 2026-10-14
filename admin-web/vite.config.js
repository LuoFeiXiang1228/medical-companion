import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:3000';
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        // 后端所有接口挂在 /api 下，开发期反向代理到本地后端
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
  };
});
