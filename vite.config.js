import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = process.env.HTTPS === 'true';

export default defineConfig({
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    host: useHttps,
  },
});

