import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy Yelp calls to avoid CORS in dev
      "/yelp": {
        target: "https://api.yelp.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yelp/, ""),
        headers: {
          Authorization: `Bearer ${process.env.VITE_YELP_API_KEY}`,
        },
      },
    },
  },
});
