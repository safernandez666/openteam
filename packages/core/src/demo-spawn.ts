/**
 * Demo: Spawn a real Claude Code session, capture output, detect idle, kill.
 *
 * Usage: npx tsx packages/core/src/demo-spawn.ts [prompt]
 *
 * Default prompt: "Say hello and nothing else"
 */
import { Agent, claudeCodePrintAdapter } from "./agent-runtime/index.js";

const prompt = process.argv[2] ?? "Say hello and nothing else";
const cwd = process.cwd();

console.log("=== OpenTeam Agent Runtime Demo ===");
console.log(`CWD: ${cwd}`);
console.log(`Prompt: "${prompt}"`);
console.log("");

// Use print adapter: claude --print --output-format stream-json "prompt"
// The prompt is passed as the last CLI argument
const adapter = {
  ...claudeCodePrintAdapter,
  buildSpawnArgs(config: Parameters<typeof claudeCodePrintAdapter.buildSpawnArgs>[0]) {
    const result = claudeCodePrintAdapter.buildSpawnArgs(config);
    result.args.push(prompt);
    return result;
  },
};

const agent = new Agent(
  {
    name: "demo-agent",
    cwd,
    cli: "claude-code",
  },
  adapter,
);

agent.emitter.on("status-change", (state) => {
  console.log(`[STATUS] ${state.name}: ${state.status} (pid: ${state.pid})`);
});

agent.emitter.on("output", (output) => {
  process.stdout.write(output.data);
});

agent.emitter.on("exit", (code, signal) => {
  console.log(`\n[EXIT] code=${code} signal=${signal}`);
  console.log("=== Demo complete ===");
  process.exit(0);
});

agent.emitter.on("error", (err) => {
  console.error(`[ERROR] ${err.message}`);
});

async function run() {
  try {
    await agent.start();
  } catch (err) {
    console.error("Failed to start agent:", err);
    process.exit(1);
  }
}

run();
