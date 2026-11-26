/** What the MCP server tells a client about when to use each tool. */
export const INSTRUCTIONS = `Quota broker: one shared ledger per service and account, so a fleet of agents doesn't drain a shared API limit.

- **Before a batch of calls** (a script, a loop, a bulk fetch) → quota_acquire with the cost, then quota_release with what it used.
- **"How much GitHub budget is left?" / "Who used it?"** → quota_status.
- **"What limits apply?"** → quota_policies. They're set by the owner in the broker's deploy config; no tool changes them.
- **After a response with rate-limit headers** → quota_report keeps the ledger true.
- Single \`gh\` calls are checked by a hook before they run, so they don't need these tools.`
