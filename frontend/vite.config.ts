import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
 
export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? 'dev')
  },
  server: {
    host: true,
    allowedHosts: [
      'delicious-overheat-headway.ngrok-free.dev',
      '192.168.1.193',
      '192.168.1.73',
      'localhost',  
    ],
  hmr: {
    port: 5174,  // WebSocket auf separatem Port, nicht durch ngrok getunnelt
  },
    proxy: {
      // Proxy API calls to the FastAPI backend during development
      "/api": "http://localhost:8000",
    },
  },
});
