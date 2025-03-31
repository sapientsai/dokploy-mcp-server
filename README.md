# Microsoft To Do MCP

This MCP (Model Context Protocol) service allows you to interact with Microsoft To Do tasks using an AI assistant.

## Setup Instructions

### 1. Prerequisites

- Node.js 16 or higher
- npm
- A Microsoft account (Microsoft 365 business account recommended)
- Azure App Registration (see setup below)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/todoMCP.git
cd todoMCP
npm install
```

### 3. Azure App Registration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to "App registrations" and create a new registration
3. Name your application (e.g., "To Do MCP")
4. For "Supported account types", select one of the following based on your needs:
   - **Accounts in this organizational directory only (Single tenant)** - For use within a single organization
   - **Accounts in any organizational directory (Any Azure AD directory - Multitenant)** - For use across multiple organizations
   - **Accounts in any organizational directory and personal Microsoft accounts** - For both work accounts and personal accounts
5. Set the Redirect URI to `http://localhost:3000/callback`
6. After creating the app, go to "Certificates & secrets" and create a new client secret
7. Go to "API permissions" and add the following permissions:
   - Microsoft Graph > Delegated permissions:
     - Tasks.Read
     - Tasks.ReadWrite
     - User.Read
8. Click "Grant admin consent" for these permissions

### 4. Configuration

Create a `.env` file in the root directory with the following information:

```
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
TENANT_ID=your_tenant_setting
REDIRECT_URI=http://localhost:3000/callback
```

**TENANT_ID Options:**
- `organizations` - For multi-tenant organizational accounts (default if not specified)
- `consumers` - For personal Microsoft accounts only 
- `common` - For both organizational and personal accounts
- `your-specific-tenant-id` - For single-tenant configurations

**Examples:**
```
# For multi-tenant organizational accounts (default)
TENANT_ID=organizations

# For personal Microsoft accounts
TENANT_ID=consumers

# For both organizational and personal accounts
TENANT_ID=common

# For a specific organization tenant
TENANT_ID=00000000-0000-0000-0000-000000000000
```

### 5. Authentication

Run the authentication server:

```bash
npm run auth
```

This will open a browser window for you to authenticate with Microsoft. Once authenticated, the tokens will be saved to `tokens.json`.

### 6. Build and Run

Build the application:

```bash
npm run build
```

Run the MCP server:

```bash
npm run start
```

## Using with Cursor

To use this MCP with Cursor, the MCP configuration is already set up in the `.cursor/mcp.json` file. This configuration tells Cursor how to start and communicate with the MCP server.

When you open this project in Cursor, it will automatically detect the MCP server and make it available for use.

Alternatively, you can configure the MCP server globally by adding it to your global Cursor configuration file:

1. Open your global Cursor configuration file:
   - macOS: `~/.cursor/mcp.json`
   - Windows: `%USERPROFILE%\.cursor\mcp.json`
   - Linux: `~/.cursor/mcp.json`

2. Add the following configuration:

```json
{
  "mcpServers": {
    "mstodo": {
      "command": "npm",
      "args": ["run", "start"],
      "cwd": "/path/to/todoMCP",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Replace `/path/to/todoMCP` with the actual path to this repository on your machine.

## Available Tools

- `auth-status`: Check your authentication status
- `get-task-lists`: Get all your To Do task lists
- `create-task-list`: Create a new task list
- `update-task-list`: Update an existing task list
- `delete-task-list`: Delete a task list
- `get-tasks`: Get all tasks in a list
- `create-task`: Create a new task
- `update-task`: Update an existing task
- `delete-task`: Delete a task
- `get-checklist-items`: Get checklist items for a task
- `create-checklist-item`: Create a checklist item
- `update-checklist-item`: Update a checklist item
- `delete-checklist-item`: Delete a checklist item

## Limitations

- Personal Microsoft accounts (outlook.com, hotmail.com, etc.) may experience the "MailboxNotEnabledForRESTAPI" error
- The API requires proper authentication and permissions
- Rate limits may apply according to Microsoft's policies

## Troubleshooting

### Authentication Issues

- **"MailboxNotEnabledForRESTAPI" error**: This typically means you're using a personal Microsoft account. Microsoft To Do API access is limited for personal accounts through the Graph API.
  
- **Token acquisition failures**: Make sure your `CLIENT_ID`, `CLIENT_SECRET`, and `TENANT_ID` are correct in your `.env` file.

- **Permission issues**: Ensure you have granted admin consent for the required permissions in your Azure App registration.

### Account Type Issues

- **Work/School Accounts**: These typically work best with the To Do API. Use `TENANT_ID=organizations` or your specific tenant ID.

- **Personal Accounts**: These have limited access to the To Do API. If you must use a personal account, try `TENANT_ID=consumers` or `TENANT_ID=common`.

### Checking Authentication Status

You can check your authentication status using the `auth-status` tool or by examining the expiration time in your tokens:

```bash
cat tokens.json | grep expiresAt
```

To convert the timestamp to a readable date:

```bash
date -r $(echo "$(cat tokens.json | grep expiresAt | cut -d ":" -f2 | cut -d "," -f1) / 1000" | bc)
``` 