import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { startServer } from "openteam-web";
import { DEFAULT_CONFIG } from "./types.js";

const { port, host, width, height } = DEFAULT_CONFIG;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width,
    height,
    title: "OpenTeam",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://${host}:${port}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Start the embedded server
  startServer(port, host);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
