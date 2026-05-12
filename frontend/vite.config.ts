import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";
 
export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    allowedHosts: [
      'delicious-overheat-headway.ngrok-free.dev',
      '192.168.1.193',
      '192.168.1.73',
      'localhost',
    ],
    proxy: {
      // Proxy API calls to the FastAPI backend during development
      "/api": "http://localhost:8000",
    },
  },
});
