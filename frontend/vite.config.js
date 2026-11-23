import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In local dev, /api is proxied to the backend so VITE_API_URL can stay empty.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
