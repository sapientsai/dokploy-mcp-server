# OpenFDA MCP Server

An MCP (Model Context Protocol) server that provides access to U.S. FDA public datasets including drugs, medical devices, adverse events, recalls, and more.

## Features

- **10 FDA Tools**: Query drug and device databases through a standardized MCP interface
- **Drug Tools**: Adverse events (FAERS), labels, NDC directory, recalls, Drugs@FDA, shortages
- **Device Tools**: 510(k) clearances, classifications, adverse events (MDR), recalls
- **Individual Record Lookup**: Retrieve specific reports by ID (safety report ID, set ID, MDR report number)
- **Advanced Filtering**: Filter drug labels by boxed warnings, request specific label sections
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

| Tool                         | Description                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `search_drug_adverse_events` | Search FAERS for drug safety reports. Retrieve specific report by `safetyReportId`.                    |
| `search_drug_labels`         | Search drug labeling/prescribing info. Get by `setId`, filter by `hasBoxedWarning`, select `sections`. |
| `search_drug_ndc`            | Search the National Drug Code directory                                                                |
| `search_drug_recalls`        | Search drug recall enforcement reports                                                                 |
| `search_drugs_at_fda`        | Search approved drug applications                                                                      |
| `search_drug_shortages`      | Search current and resolved drug shortages                                                             |

### Device Tools

| Tool                            | Description                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `search_device_510k`            | Search 510(k) premarket notifications                                         |
| `search_device_classifications` | Search device classification database                                         |
| `search_device_adverse_events`  | Search MDR adverse event reports. Retrieve specific report by `reportNumber`. |
| `search_device_recalls`         | Search device recall enforcement reports                                      |

## Tool Parameters

### search_drug_labels

| Parameter          | Type     | Description                                                  |
| ------------------ | -------- | ------------------------------------------------------------ |
| `setId`            | string   | Retrieve a specific label by its unique set_id               |
| `drugName`         | string   | Drug brand or generic name                                   |
| `indication`       | string   | Medical indication or use case                               |
| `activeIngredient` | string   | Active ingredient/substance name                             |
| `route`            | string   | Route of administration (e.g., 'oral', 'intravenous')        |
| `hasBoxedWarning`  | boolean  | Filter for drugs with boxed warnings (most serious warnings) |
| `sections`         | string[] | Specific label sections to return (see below)                |
| `limit`            | number   | Maximum results (1-100)                                      |
| `skip`             | number   | Number of results to skip for pagination                     |

**Available sections**: `indications_and_usage`, `dosage_and_administration`, `contraindications`, `warnings`, `warnings_and_cautions`, `adverse_reactions`, `drug_interactions`, `clinical_pharmacology`, `mechanism_of_action`, `pharmacokinetics`, `overdosage`, `description`, `how_supplied`, `storage_and_handling`, `boxed_warning`

### search_drug_adverse_events

| Parameter        | Type    | Description                                        |
| ---------------- | ------- | -------------------------------------------------- |
| `safetyReportId` | string  | Retrieve a specific FAERS report by its 8-digit ID |
| `drugName`       | string  | Drug or product name to search                     |
| `reaction`       | string  | Adverse reaction (e.g., 'headache', 'nausea')      |
| `manufacturer`   | string  | Drug manufacturer name                             |
| `serious`        | boolean | Filter for serious adverse events only             |
| `dateFrom`       | string  | Start date (YYYY-MM-DD)                            |
| `dateTo`         | string  | End date (YYYY-MM-DD)                              |
| `limit`          | number  | Maximum results (1-100)                            |
| `skip`           | number  | Number of results to skip for pagination           |

### search_device_adverse_events

| Parameter          | Type   | Description                                     |
| ------------------ | ------ | ----------------------------------------------- |
| `reportNumber`     | string | Retrieve a specific MDR report by report number |
| `deviceName`       | string | Device generic name                             |
| `brandName`        | string | Device brand name                               |
| `manufacturerName` | string | Device manufacturer name                        |
| `eventType`        | string | Type: 'Injury', 'Malfunction', 'Death', 'Other' |
| `dateFrom`         | string | Start date (YYYY-MM-DD)                         |
| `dateTo`           | string | End date (YYYY-MM-DD)                           |
| `limit`            | number | Maximum results (1-100)                         |
| `skip`             | number | Number of results to skip for pagination        |

## Usage Examples

### Search for drug adverse events

```
Find adverse events for aspirin in the last year that were serious
```

### Get a specific adverse event report

```
Retrieve FAERS report with safety report ID 10003641
```

### Search for drugs with boxed warnings

```
Find all drugs with boxed warnings related to cardiovascular risks
```

### Get specific label sections

```
Get the boxed_warning and contraindications sections for warfarin
```

### Search for drug recalls

```
Search for Class I drug recalls from Pfizer
```

### Search for device clearances

```
Find 510(k) clearances for cardiac pacemakers
```

### Get a specific device adverse event report

```
Retrieve MDR report number 2649622-2020-08294
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
import { createOpenFDAServer, handleSearchDrugAdverseEvents, handleSearchDrugLabels } from "openfda-mcp-server/lib"

// Create a custom server
const server = createOpenFDAServer({
  name: "my-fda-server",
  version: "1.0.0",
})

// Search for adverse events
const adverseEvents = await handleSearchDrugAdverseEvents({
  drugName: "aspirin",
  serious: true,
  limit: 10,
})

// Get a specific adverse event by ID
const specificReport = await handleSearchDrugAdverseEvents({
  safetyReportId: "10003641",
})

// Search for drugs with boxed warnings
const boxedWarningDrugs = await handleSearchDrugLabels({
  hasBoxedWarning: true,
  limit: 10,
})

// Get specific sections of a drug label
const warfarinLabel = await handleSearchDrugLabels({
  setId: "0cbce382-9c88-4f58-ae0f-532a841e8f95",
  sections: ["boxed_warning", "contraindications", "adverse_reactions"],
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

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
