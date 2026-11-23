import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Khi chạy dev, mọi lời gọi /api và /socket.io được chuyển sang backend (cổng 3000)
// nên frontend và backend coi như cùng một địa chỉ, không vướng CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Cho phép mở qua đường hầm Cloudflare (xem web trên điện thoại khi không chung Wi-Fi)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
