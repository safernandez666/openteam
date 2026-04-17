import { startServer } from "@openteam/web";

const command = process.argv[2];

if (command === "start" || !command) {
  startServer();
} else {
  console.error(`Unknown command: ${command}`);
  console.log("Usage: openteam start");
  process.exit(1);
}
