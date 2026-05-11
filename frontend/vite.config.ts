import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      // Proxy API calls to the FastAPI backend during development
      "/api": "http://localhost:8000",
    },
  },
});
