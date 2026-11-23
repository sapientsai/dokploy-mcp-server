# mcp-servers

Small [MCP](https://modelcontextprotocol.io) servers built on [somamcp](https://github.com/sapientsai/SomaMCP), one npm package per server.

| Server                             | npm                                                                            | What it does                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [dokploy](./servers/dokploy)       | [`dokploy-mcp-server`](https://www.npmjs.com/package/dokploy-mcp-server)       | Manage a [Dokploy](https://dokploy.com) instance                                                 |
| [temporal](./servers/temporal)     | [`temporal-mcp-server`](https://www.npmjs.com/package/temporal-mcp-server)     | Time and timezone tools; hosted at `time.somamcp.com`                                            |
| [openfda](./servers/openfda)       | [`openfda-mcp-server`](https://www.npmjs.com/package/openfda-mcp-server)       | FDA data (drugs, devices, recalls, adverse events) from openFDA; hosted at `openfda.somamcp.com` |
| [rescuetime](./servers/rescuetime) | [`rescuetime-mcp-server`](https://www.npmjs.com/package/rescuetime-mcp-server) | Read your [RescueTime](https://www.rescuetime.com) productivity data                             |

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
