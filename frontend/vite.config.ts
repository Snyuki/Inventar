import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    allowedHosts: ['delicious-overheat-headway.ngrok-free.dev'],
    proxy: {
      // Proxy API calls to the FastAPI backend during development
      "/api": "http://localhost:8000",
    },
  },
});
