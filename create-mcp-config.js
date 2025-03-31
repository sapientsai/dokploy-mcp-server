import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mcpConfig = {
  "mcpServers": {
    "mstodo": {
      "command": "npm",
      "args": ["run", "start"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
};

const cursorDir = path.join(process.cwd(), '.cursor');

// Ensure .cursor directory exists
if (!fs.existsSync(cursorDir)) {
  fs.mkdirSync(cursorDir);
}

// Write the MCP configuration file
fs.writeFileSync(
  path.join(cursorDir, 'mcp.json'),
  JSON.stringify(mcpConfig, null, 2),
  'utf8'
);

console.log('MCP configuration file created at .cursor/mcp.json'); 