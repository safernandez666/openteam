# Troubleshooting Guide

## Facu (PM) Issues

### Facu doesn't respond
**Symptoms:** Chat shows "Thinking..." indefinitely or no response at all.

**Checklist:**
1. Verify CLI is installed: `which claude` or `which kimi`
2. Check that the provider is available: `claude --version` or `kimi --version`
3. Check server logs for errors in `packages/web/` console
4. Inspect chat history in SQLite:
   ```bash
   sqlite3 ~/.openteam/projects/<project>/workspaces/<ws>/openteam.db \
     "SELECT role, substr(content, 1, 100) FROM chat_messages ORDER BY id DESC LIMIT 5;"
   ```
5. Try clearing chat: restart server or switch workspace and back

### Facu gives wrong answers about the team
**Symptoms:** Facu mentions agents that don't exist or wrong names.

**Fix:** The system prompt is hardcoded in `packages/core/src/chat/chat-session.ts`. Verify the `ROLES` array matches your actual team config. Facu should only reference roles present in `team-config.json`.

## Worker Issues

### Worker hangs / never completes
**Symptoms:** Task stays "in_progress" for hours.

**Causes & Fixes:**
- **Interactive prompt:** Claude/Kimi asked for confirmation. Workers run non-interactively but some tools (like `npm init`) prompt. Kill the process and retry.
  ```bash
  pkill -f "claude --print"
  ```
- **Infinite loop:** Worker got stuck in a loop. The orchestrator has no loop detection yet. Manually mark task failed and retry.
- **PTY deadlock:** Rare, but PTY sessions can deadlock. Restart server.

### Worker fails immediately
**Symptoms:** Status goes to `failed` within seconds.

**Checklist:**
1. Check `last_error` field in task
2. Verify working directory exists and is accessible
3. Check that the role has a valid skill file in `packages/core/src/skills/built-in/`
4. Review agent memory — maybe a lesson is blocking progress

### Wrong model / too expensive
**Symptoms:** Simple tasks using Claude Sonnet when Kimi mini would suffice.

**Fix:** Check tier assignment. Go to Workers panel and verify the role's tier. Economy/Fast should use Kimi. Standard/Quality/Premium use Claude.

## Workflow Issues

### Workflow doesn't auto-advance
**Symptoms:** Phase completes but next phase doesn't start.

**Checklist:**
1. Check gate executions for the completed task: `gate_executions` table status must be `passed`
2. If gate `failed`, task returns to `in_progress` — check gate output
3. Verify workflow instance status is `running` (not `paused`)
4. Check orchestrator is polling: look for "Polling tasks..." in server logs

### Wrong workflow detected
**Symptoms:** User says "fix this" but Facu starts Feature workflow instead of Bug Fix.

**Fix:** Detection is keyword-based. Check `DETECTION_RULES` in `packages/core/src/context/workflow-engine.ts`. You can adjust keywords or manually select workflow in UI.

## Gate Issues

### Gate fails but shouldn't
**Symptoms:** lint-test-build fails on code that builds fine locally.

**Causes:**
- Worker changed files the gate doesn't see (git state mismatch)
- Gate runs in different directory than worker
- Environment differences (Node version, deps)

**Fix:** Check gate output for exact error. Run the same command locally to reproduce.

### Gate never runs
**Symptoms:** Task goes straight to `done` without gate checks.

**Fix:** Gates only run if:
1. The task is part of a workflow phase that has gates assigned
2. The gate is enabled (`is_enabled = 1`)
3. The orchestrator has `gateEngine` configured

Check `workflow_phase_gates` table for assignments.

## Database Issues

### "Database is locked"
**Symptoms:** SQLite error, operations fail.

**Fix:** SQLite WAL mode should prevent most locks. If it happens:
1. Ensure no other process has the DB open
2. Check for long-running transactions
3. Restart server (WAL checkpoint on close)

### Schema out of date
**Symptoms:** "no such column" or "no such table" errors.

**Fix:** Migrations run automatically on DB open. If you manually edited the DB:
```bash
sqlite3 openteam.db "PRAGMA user_version;"
# Should match latest migration number
```

Delete the DB and let it recreate (loses data), or manually apply missing migrations.

## UI Issues

### Kanban board doesn't update
**Symptoms:** Task status changed but board shows old state.

**Fix:**
1. Check WebSocket connection (browser devtools → Network → WS)
2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)
3. Check server console for WS errors

### Dashboard shows no data
**Symptoms:** Dashboard cards are empty or "0".

**Fix:** Dashboard queries existing tables. If no tasks have been run, there's no data. Complete a few tasks first. If data exists but dashboard is empty, check browser Network tab for API errors.

## MCP Issues

### MCP server not connecting
**Symptoms:** Tools don't appear or "connection refused".

**Checklist:**
1. Verify MCP config in workspace: `mcp-servers.json`
2. Check server is running on expected port
3. Test MCP server independently
4. Check `packages/web` logs for MCP initialization errors

## Performance Issues

### High token usage
**Symptoms:** Token counter skyrockets.

**Causes & Fixes:**
- **Context bloat:** Previous task results are too long. Context Compaction should help — verify `task_compactions` table is being populated.
- **Wrong tier:** Premium tier for simple tasks. Check tier assignments.
- **Inefficient prompts:** Worker prompt includes too much context. Review `buildWorkerPrompt()` in skill-loader.

### Slow dashboard queries
**Symptoms:** Dashboard takes > 2s to load.

**Fix:** Add indexes if missing. Check `database.ts` for index definitions. For very large workspaces, consider archiving old performance_events.

## Environment Issues

### "Node version too old"
**Fix:** OpenTeam requires Node >= 22. Use nvm:
```bash
nvm install 22
nvm use 22
```

### "pnpm not found"
**Fix:** Install pnpm:
```bash
npm install -g pnpm
```

### Build fails
**Fix:**
```bash
# Clean everything
pnpm clean
rm -rf node_modules

# Reinstall and rebuild
pnpm install
pnpm build
```

## Getting Help

If none of the above solves your issue:

1. Check server logs for stack traces
2. Check browser console for JavaScript errors
3. Open a GitHub issue with:
   - OpenTeam version (`package.json`)
   - Node version (`node --version`)
   - Steps to reproduce
   - Relevant logs (sanitized)
