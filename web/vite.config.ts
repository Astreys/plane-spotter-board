import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiTarget = process.env.VITE_DEV_API ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin in dev, so the SSE stream needs no CORS dance.
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        // Buffering would defeat the point of an event stream.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              delete proxyRes.headers["content-length"];
            }
          });
        },
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
