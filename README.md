# mcp-servers

Small [MCP](https://modelcontextprotocol.io) servers built on [somamcp](https://github.com/sapientsai/SomaMCP), one npm package per server.

| Server                             | npm                                                                            | What it does                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [dokploy](./servers/dokploy)       | [`dokploy-mcp-server`](https://www.npmjs.com/package/dokploy-mcp-server)       | Manage a [Dokploy](https://dokploy.com) instance                                                            |
| [temporal](./servers/temporal)     | [`temporal-mcp-server`](https://www.npmjs.com/package/temporal-mcp-server)     | Time and timezone tools; hosted at `time.somamcp.com`                                                       |
| [openfda](./servers/openfda)       | [`openfda-mcp-server`](https://www.npmjs.com/package/openfda-mcp-server)       | FDA data (drugs, devices, recalls, adverse events) from openFDA; hosted at `openfda.somamcp.com`            |
| [patents](./servers/patents)       | [`patents-mcp-server`](https://www.npmjs.com/package/patents-mcp-server)       | Patent data from USPTO Open Data, PTAB, EPO OPS and BigQuery                                                |
| [rescuetime](./servers/rescuetime) | [`rescuetime-mcp-server`](https://www.npmjs.com/package/rescuetime-mcp-server) | Read your [RescueTime](https://www.rescuetime.com) productivity data                                        |
| [beszel](./servers/beszel)         | [`beszel-mcp-server`](https://www.npmjs.com/package/beszel-mcp-server)         | Read a [Beszel](https://beszel.dev) hub: systems, metrics, containers, disks, alerts; optional system edits |
| [quota](./servers/quota)           | [`quota-mcp-server`](https://www.npmjs.com/package/quota-mcp-server)           | A shared API-quota broker for agent fleets: one ledger per account, owner-set rate and concurrency limits   |

Each server's README covers installing and configuring it.

## Development

```bash
pnpm install       # once, at the repo root
pnpm run ci        # every server's checks, as CI runs them
pnpm validate      # the same, fixing what it can
```

Work on one server from its folder, for example `cd servers/dokploy && pnpm test`.

## Releases

Each server is versioned and released on its own. A release is a tag `<package>@<version>`, which `pnpm release` makes on a clean, up-to-date `main`:

```bash
pnpm release dokploy patch   # bump, commit, tag dokploy-mcp-server@<version>
git push --follow-tags       # the tag publishes that server alone
```

## License

MIT

---

**A <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI logo" width="18" align="absmiddle"></a> <a href="https://sapientsai.com/">SapientsAI</a> project** · Maintained by [Jordan Burke](https://github.com/jordanburke)
