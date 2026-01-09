# OpenFDA MCP Server

An MCP (Model Context Protocol) server that provides access to U.S. FDA public datasets including drugs, medical devices, adverse events, recalls, and more.

## Features

- **10 FDA Tools**: Query drug and device databases through a standardized MCP interface
- **Drug Tools**: Adverse events (FAERS), labels, NDC directory, recalls, Drugs@FDA, shortages
- **Device Tools**: 510(k) clearances, classifications, adverse events (MDR), recalls
- **Rate Limit Aware**: Supports authenticated requests for higher rate limits (120k/hour vs 1k/hour)
- **TypeScript**: Fully typed with Zod schema validation

## Installation

```bash
# Install globally
npm install -g openfda-mcp-server

# Or use with npx
npx openfda-mcp-server
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "openfda": {
      "command": "npx",
      "args": ["-y", "openfda-mcp-server"],
      "env": {
        "OPENFDA_API_KEY": "your-api-key-optional"
      }
    }
  }
}
```

### Environment Variables

| Variable          | Description                        | Default                   |
| ----------------- | ---------------------------------- | ------------------------- |
| `OPENFDA_API_KEY` | FDA API key for higher rate limits | None (uses public limits) |

Get a free API key at: https://open.fda.gov/apis/authentication/

## Available Tools

### Drug Tools

| Tool                         | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `search_drug_adverse_events` | Search FAERS for drug safety reports         |
| `search_drug_labels`         | Search drug labeling/prescribing information |
| `search_drug_ndc`            | Search the National Drug Code directory      |
| `search_drug_recalls`        | Search drug recall enforcement reports       |
| `search_drugs_at_fda`        | Search approved drug applications            |
| `search_drug_shortages`      | Search current and resolved drug shortages   |

### Device Tools

| Tool                            | Description                              |
| ------------------------------- | ---------------------------------------- |
| `search_device_510k`            | Search 510(k) premarket notifications    |
| `search_device_classifications` | Search device classification database    |
| `search_device_adverse_events`  | Search MDR adverse event reports         |
| `search_device_recalls`         | Search device recall enforcement reports |

## Usage Examples

### Search for drug adverse events

```
Find adverse events for aspirin in the last year that were serious
```

### Search for drug recalls

```
Search for Class I drug recalls from Pfizer
```

### Search for device clearances

```
Find 510(k) clearances for cardiac pacemakers
```

### Search for device adverse events

```
Search device adverse events for insulin pumps that resulted in injury
```

## CLI Usage

```bash
# Start with stdio transport (default)
openfda-mcp-server

# Start with HTTP transport
openfda-mcp-server --transport http --port 3000
```

## Docker

### Quick Start

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build manually
docker build -t openfda-mcp-server .
docker run -p 3000:3000 -e OPENFDA_API_KEY=your-key openfda-mcp-server
```

### Docker Compose

```yaml
services:
  openfda-mcp:
    image: openfda-mcp-server:latest
    ports:
      - "3000:3000"
    environment:
      - OPENFDA_API_KEY=${OPENFDA_API_KEY:-}
```

### Environment Variables

Pass environment variables to the container:

```bash
docker run -p 3000:3000 \
  -e OPENFDA_API_KEY=your-api-key \
  -e DEBUG=openfda-mcp:* \
  openfda-mcp-server
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Test locally
pnpm serve:test

# Run full validation (format, lint, test, build)
pnpm validate

# Build for production
pnpm build
```

## Programmatic Usage

```typescript
import { createOpenFDAServer, handleSearchDrugAdverseEvents } from "openfda-mcp-server/lib"

// Create a custom server
const server = createOpenFDAServer({
  name: "my-fda-server",
  version: "1.0.0",
})

// Or use handlers directly
const result = await handleSearchDrugAdverseEvents({
  drugName: "aspirin",
  serious: true,
  limit: 10,
})
```

## API Rate Limits

| Authentication  | Per Minute | Per Hour |
| --------------- | ---------- | -------- |
| Without API Key | 40         | 1,000    |
| With API Key    | 240        | 120,000  |

## License

MIT

## Acknowledgments

- [OpenFDA](https://open.fda.gov/) - FDA open data API
