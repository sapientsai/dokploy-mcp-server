# DAKboard MCP Server

A Model Context Protocol (MCP) server for managing DAKboard digital dashboards - screens, blocks, devices, loops, and metrics.

[![npm version](https://img.shields.io/npm/v/dakboard-mcp-server.svg)](https://www.npmjs.com/package/dakboard-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/dakboard-mcp-server.svg)](https://www.npmjs.com/package/dakboard-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Option 1: NPX (No install required)

```bash
DAKBOARD_API_KEY=your_api_key npx dakboard-mcp-server
```

Or add to your MCP config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "dakboard": {
      "command": "npx",
      "args": ["dakboard-mcp-server"],
      "env": {
        "DAKBOARD_API_KEY": "your_api_key"
      }
    }
  }
}
```

### Option 2: Claude Code

```bash
claude mcp add --transport stdio dakboard -- npx dakboard-mcp-server
```

Then set the environment variable in your shell before launching Claude Code:

```bash
export DAKBOARD_API_KEY=your_api_key
```

## Tools

### Screens

| Tool            | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `list_screens`  | List all DAKboard screens                                            |
| `get_screen`    | Get detailed screen information including settings                   |
| `update_screen` | Update screen settings (name, orientation, dimensions, refresh rate) |

### Blocks

| Tool                      | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `list_blocks`             | List all blocks on a screen                                                         |
| `get_block`               | Get detailed block information                                                      |
| `update_block`            | Update block position, size, content, and visibility                                |
| `visualize_screen_layout` | Visualize spatial layout as ASCII diagram (provide screen_uuid for accurate layout) |

### Loops

| Tool         | Description                                |
| ------------ | ------------------------------------------ |
| `list_loops` | List all screen loops                      |
| `get_loop`   | Get loop details including screen rotation |

### Devices

| Tool            | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `list_devices`  | List all DAKboard devices                                  |
| `get_device`    | Get detailed device information                            |
| `update_device` | Update device settings (name, IP address, assigned screen) |

### Metrics

| Tool                        | Description                                |
| --------------------------- | ------------------------------------------ |
| `list_metrics`              | List all custom metrics                    |
| `get_metric`                | Get a metric with its data points          |
| `create_metric_data_points` | Create data points for a metric            |
| `delete_metric`             | Delete a metric and all its data points    |
| `delete_metric_data_points` | Delete data points at a specific timestamp |

### Utility

| Tool                       | Description                              |
| -------------------------- | ---------------------------------------- |
| `test_dakboard_connection` | Test server connection and configuration |

## Configuration

### Environment Variables

| Variable           | Required | Default     | Description                             |
| ------------------ | -------- | ----------- | --------------------------------------- |
| `DAKBOARD_API_KEY` | **Yes**  | -           | Your DAKboard API key                   |
| `TRANSPORT_TYPE`   | No       | `stdio`     | Transport mode: `stdio` or `httpStream` |
| `PORT`             | No       | `3000`      | Port for HTTP server mode               |
| `HOST`             | No       | `127.0.0.1` | Host for HTTP server mode               |

### Getting Your API Key

1. Log in to [DAKboard](https://dakboard.com)
2. Go to **Settings** > **API**
3. Copy your API key

## Development

### Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Build TypeScript
pnpm dev            # Build with watch mode
pnpm test           # Run tests
pnpm lint           # Lint code
pnpm format         # Format code
pnpm validate       # Format + lint + test + build (pre-commit check)
pnpm run ci         # validate's checks without fixing, as CI runs them (type `run`: `pnpm ci` is a clean install)
pnpm inspect        # Build and launch MCP Inspector
```

### CLI Options

```bash
npx dakboard-mcp-server --version    # Show version
npx dakboard-mcp-server --help       # Show help
```

## HTTP Server Mode

For web-based clients, use HTTP transport:

```bash
DAKBOARD_API_KEY=your_api_key TRANSPORT_TYPE=httpStream PORT=3000 node dist/index.js
```

The server will be available at `http://127.0.0.1:3000/mcp`.

## Architecture

Built with:

- [FastMCP](https://github.com/jlowin/fastmcp) - MCP server framework
- [Zod](https://zod.dev/) - Schema validation for tool parameters
- [functype](https://functype.org/) - Functional programming (Either for errors, Branded types for IDs)
- [ts-builds](https://github.com/jordanburke/ts-builds) - Standardized TypeScript build toolchain

## License

MIT

---

Maintained by [Jordan Burke](https://github.com/jordanburke) · **Affiliated with <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI logo" width="18" align="absmiddle"></a> <a href="https://sapientsai.com/">SapientsAI</a>**
