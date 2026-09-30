import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    root: 'frontend',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'frontend/index.html'),
          login: path.resolve(__dirname, 'frontend/login.html'),
          register: path.resolve(__dirname, 'frontend/register.html'),
          dashboard: path.resolve(__dirname, 'frontend/dashboard.html'),
          meeting: path.resolve(__dirname, 'frontend/meeting.html'),
          profile: path.resolve(__dirname, 'frontend/profile.html'),
        }
      }
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
