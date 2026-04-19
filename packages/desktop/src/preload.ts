import { contextBridge } from "electron";

// Expose a minimal safe API to the renderer.
// The app communicates via HTTP/WS so no IPC is needed yet.
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  isDesktop: true,
});
