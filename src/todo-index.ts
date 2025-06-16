import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import dotenv from "dotenv"
import { tokenManager } from "./token-manager.js"

// Load environment variables
dotenv.config()

// Log the current working directory
console.error("Current working directory:", process.cwd())

// Microsoft Graph API endpoints
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const USER_AGENT = "microsoft-todo-mcp-server/1.0"

// Create server instance
const server = new McpServer({
  name: "mstodo",
  version: "1.0.0",
})

// Helper function for making Microsoft Graph API requests
async function makeGraphRequest<T>(url: string, token: string, method = "GET", body?: any): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  try {
    const options: RequestInit = {
      method,
      headers,
    }

    if (body && (method === "POST" || method === "PATCH")) {
      options.body = JSON.stringify(body)
    }

    console.error(`Making request to: ${url}`)
    console.error(
      `Request options: ${JSON.stringify({
        method,
        headers: {
          ...headers,
          Authorization: "Bearer [REDACTED]",
        },
      })}`,
    )

    let response = await fetch(url, options)

    // If we get a 401, try to refresh the token and retry once
    if (response.status === 401) {
      console.error("Got 401, attempting token refresh...")
      const newToken = await getAccessToken() // This will trigger refresh
      if (newToken && newToken !== token) {
        // Retry with new token
        headers.Authorization = `Bearer ${newToken}`
        response = await fetch(url, { ...options, headers })
      }
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`HTTP error! status: ${response.status}, body: ${errorText}`)

      // Check for the specific MailboxNotEnabledForRESTAPI error
      if (errorText.includes("MailboxNotEnabledForRESTAPI")) {
        console.error(`
=================================================================
ERROR: MailboxNotEnabledForRESTAPI

The Microsoft To Do API is not available for personal Microsoft accounts 
(outlook.com, hotmail.com, live.com, etc.) through the Graph API.

This is a limitation of the Microsoft Graph API, not an authentication issue.
Microsoft only allows To Do API access for Microsoft 365 business accounts.

You can still use Microsoft To Do through the web interface or mobile apps,
but API access is restricted for personal accounts.
=================================================================
        `)

        throw new Error(
          "Microsoft To Do API is not available for personal Microsoft accounts. See console for details.",
        )
      }

      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
    }

    const data = await response.json()
    console.error(`Response received: ${JSON.stringify(data).substring(0, 200)}...`)
    return data as T
  } catch (error) {
    console.error("Error making Graph API request:", error)
    return null
  }
}

// Authentication helper using delegated flow with token manager
async function getAccessToken(): Promise<string | null> {
  try {
    console.error("getAccessToken called")

    // Use the token manager to get tokens (handles all sources and refresh)
    const tokens = await tokenManager.getTokens()

    if (tokens) {
      console.error(`Successfully retrieved valid token`)
      return tokens.accessToken
    }

    console.error("No valid tokens available")
    return null
  } catch (error) {
    console.error("Error getting access token:", error)
    return null
  }
}

// Server configuration type
interface ServerConfig {
  accessToken?: string
  refreshToken?: string
  tokenFilePath?: string
}

// Function to check if the account is a personal Microsoft account
async function isPersonalMicrosoftAccount(): Promise<boolean> {
  try {
    const token = await getAccessToken()
    if (!token) return false

    // Make a request to get user info
    const url = `${MS_GRAPH_BASE}/me`
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      console.error(`Error getting user info: ${response.status}`)
      return false
    }

    const userData = await response.json()
    const email = userData.mail || userData.userPrincipalName || ""

    // Check if the email domain indicates a personal account
    const personalDomains = ["outlook.com", "hotmail.com", "live.com", "msn.com", "passport.com"]
    const domain = email.split("@")[1]?.toLowerCase()

    if (domain && personalDomains.some((d) => domain.includes(d))) {
      console.error(`
=================================================================
WARNING: Personal Microsoft Account Detected

Your Microsoft account (${email}) appears to be a personal account.
Microsoft To Do API access is typically not available for personal accounts
through the Microsoft Graph API, only for Microsoft 365 business accounts.

You may encounter the "MailboxNotEnabledForRESTAPI" error when trying to
access To Do lists or tasks. This is a limitation of the Microsoft Graph API,
not an issue with your authentication or this application.

You can still use Microsoft To Do through the web interface or mobile apps,
but API access is restricted for personal accounts.
=================================================================
      `)
      return true
    }

    return false
  } catch (error) {
    console.error("Error checking account type:", error)
    return false
  }
}

// Server tool to check authentication status
server.tool(
  "auth-status",
  "Check if you're authenticated with Microsoft Graph API. Shows current token status and expiration time, and indicates if the token needs to be refreshed.",
  {},
  async () => {
    const tokens = await tokenManager.getTokens()

    if (!tokens) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please run 'npx microsoft-todo-mcp-server setup' to authenticate with Microsoft.",
          },
        ],
      }
    }

    const isExpired = Date.now() > tokens.expiresAt
    const expiryTime = new Date(tokens.expiresAt).toLocaleString()

    // Check if it's a personal account
    const isPersonal = await isPersonalMicrosoftAccount()
    let accountMessage = ""

    if (isPersonal) {
      accountMessage =
        "\n\n⚠️ WARNING: You are using a personal Microsoft account. " +
        "Microsoft To Do API access is typically not available for personal accounts " +
        "through the Microsoft Graph API. You may encounter 'MailboxNotEnabledForRESTAPI' errors. " +
        "This is a Microsoft limitation, not an authentication issue."
    }

    if (isExpired) {
      return {
        content: [
          {
            type: "text",
            text: `Authentication expired at ${expiryTime}. Will attempt to refresh when you call any API.${accountMessage}`,
          },
        ],
      }
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Authenticated. Token expires at ${expiryTime}.${accountMessage}`,
          },
        ],
      }
    }
  },
)

interface TaskList {
  id: string
  displayName: string
  isOwner?: boolean
  isShared?: boolean
  wellknownListName?: string // 'none', 'defaultList', 'flaggedEmails', 'unknownFutureValue'
}

interface Task {
  id: string
  title: string
  status: string
  importance: string
  dueDateTime?: {
    dateTime: string
    timeZone: string
  }
  body?: {
    content: string
    contentType: string
  }
  categories?: string[]
}

interface ChecklistItem {
  id: string
  displayName: string
  isChecked: boolean
  createdDateTime?: string
}

// Register tools
server.tool(
  "get-task-lists",
  "Get all Microsoft Todo task lists (the top-level containers that organize your tasks). Shows list names, IDs, and indicates default or shared lists.",
  {},
  async () => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      const response = await makeGraphRequest<{ value: TaskList[] }>(`${MS_GRAPH_BASE}/me/todo/lists`, token)

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve task lists",
            },
          ],
        }
      }

      const lists = response.value || []
      if (lists.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No task lists found.",
            },
          ],
        }
      }

      const formattedLists = lists.map((list) => {
        // Add well-known list name if applicable
        let wellKnownInfo = ""
        if (list.wellknownListName && list.wellknownListName !== "none") {
          if (list.wellknownListName === "defaultList") {
            wellKnownInfo = " (Default Tasks List)"
          } else if (list.wellknownListName === "flaggedEmails") {
            wellKnownInfo = " (Flagged Emails)"
          }
        }

        // Add sharing info if applicable
        let sharingInfo = ""
        if (list.isShared) {
          sharingInfo = list.isOwner ? " (Shared by you)" : " (Shared with you)"
        }

        return `ID: ${list.id}\nName: ${list.displayName}${wellKnownInfo}${sharingInfo}\n---`
      })

      return {
        content: [
          {
            type: "text",
            text: `Your task lists:\n\n${formattedLists.join("\n")}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching task lists: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "create-task-list",
  "Create a new task list (top-level container) in Microsoft Todo to help organize your tasks into categories or projects.",
  {
    displayName: z.string().describe("Name of the new task list"),
  },
  async ({ displayName }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Prepare the request body
      const requestBody = {
        displayName,
      }

      // Make the API request to create the task list
      const response = await makeGraphRequest<TaskList>(`${MS_GRAPH_BASE}/me/todo/lists`, token, "POST", requestBody)

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create task list: ${displayName}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Task list created successfully!\nName: ${response.displayName}\nID: ${response.id}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating task list: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "update-task-list",
  "Update the name of an existing task list (top-level container) in Microsoft Todo.",
  {
    listId: z.string().describe("ID of the task list to update"),
    displayName: z.string().describe("New name for the task list"),
  },
  async ({ listId, displayName }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Prepare the request body
      const requestBody = {
        displayName,
      }

      // Make the API request to update the task list
      const response = await makeGraphRequest<TaskList>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}`,
        token,
        "PATCH",
        requestBody,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to update task list with ID: ${listId}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Task list updated successfully!\nNew name: ${response.displayName}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating task list: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "delete-task-list",
  "Delete a task list (top-level container) from Microsoft Todo. This will remove the list and all tasks within it.",
  {
    listId: z.string().describe("ID of the task list to delete"),
  },
  async ({ listId }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Make a DELETE request to the Microsoft Graph API
      const url = `${MS_GRAPH_BASE}/me/todo/lists/${listId}`
      console.error(`Deleting task list: ${url}`)

      // The DELETE method doesn't return a response body, so we expect null
      await makeGraphRequest<null>(url, token, "DELETE")

      // If we get here, the delete was successful (204 No Content)
      return {
        content: [
          {
            type: "text",
            text: `Task list with ID: ${listId} was successfully deleted.`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting task list: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "get-tasks",
  "Get tasks from a specific Microsoft Todo list. These are the main todo items that can contain checklist items (subtasks).",
  {
    listId: z.string().describe("ID of the task list"),
    filter: z.string().optional().describe("OData $filter query (e.g., 'status eq \\'completed\\'')"),
    select: z.string().optional().describe("Comma-separated list of properties to include (e.g., 'id,title,status')"),
    orderby: z.string().optional().describe("Property to sort by (e.g., 'createdDateTime desc')"),
    top: z.number().optional().describe("Maximum number of tasks to retrieve"),
    skip: z.number().optional().describe("Number of tasks to skip"),
    count: z.boolean().optional().describe("Whether to include a count of tasks"),
  },
  async ({ listId, filter, select, orderby, top, skip, count }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Build the query parameters
      const queryParams = new URLSearchParams()

      if (filter) queryParams.append("$filter", filter)
      if (select) queryParams.append("$select", select)
      if (orderby) queryParams.append("$orderby", orderby)
      if (top !== undefined) queryParams.append("$top", top.toString())
      if (skip !== undefined) queryParams.append("$skip", skip.toString())
      if (count !== undefined) queryParams.append("$count", count.toString())

      // Construct the URL with query parameters
      const queryString = queryParams.toString()
      const url = `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks${queryString ? "?" + queryString : ""}`

      console.error(`Making request to: ${url}`)

      const response = await makeGraphRequest<{ value: Task[]; "@odata.count"?: number }>(url, token)

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve tasks for list: ${listId}`,
            },
          ],
        }
      }

      const tasks = response.value || []
      if (tasks.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No tasks found in list with ID: ${listId}`,
            },
          ],
        }
      }

      // Format the tasks based on available properties
      const formattedTasks = tasks.map((task) => {
        // Default format
        let taskInfo = `ID: ${task.id}\nTitle: ${task.title}`

        // Add status if available
        if (task.status) {
          const status = task.status === "completed" ? "✓" : "○"
          taskInfo = `${status} ${taskInfo}`
        }

        // Add due date if available
        if (task.dueDateTime) {
          taskInfo += `\nDue: ${new Date(task.dueDateTime.dateTime).toLocaleDateString()}`
        }

        // Add importance if available
        if (task.importance) {
          taskInfo += `\nImportance: ${task.importance}`
        }

        // Add categories if available
        if (task.categories && task.categories.length > 0) {
          taskInfo += `\nCategories: ${task.categories.join(", ")}`
        }

        // Add body content if available and not empty
        if (task.body && task.body.content && task.body.content.trim() !== "") {
          const previewLength = 50
          const contentPreview =
            task.body.content.length > previewLength
              ? task.body.content.substring(0, previewLength) + "..."
              : task.body.content
          taskInfo += `\nDescription: ${contentPreview}`
        }

        return `${taskInfo}\n---`
      })

      // Add count information if requested and available
      let countInfo = ""
      if (count && response["@odata.count"] !== undefined) {
        countInfo = `Total count: ${response["@odata.count"]}\n\n`
      }

      return {
        content: [
          {
            type: "text",
            text: `Tasks in list ${listId}:\n\n${countInfo}${formattedTasks.join("\n")}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching tasks: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "create-task",
  "Create a new task in a specific Microsoft Todo list. A task is the main todo item that can have a title, description, due date, and other properties.",
  {
    listId: z.string().describe("ID of the task list"),
    title: z.string().describe("Title of the task"),
    body: z.string().optional().describe("Description or body content of the task"),
    dueDateTime: z.string().optional().describe("Due date in ISO format (e.g., 2023-12-31T23:59:59Z)"),
    startDateTime: z.string().optional().describe("Start date in ISO format (e.g., 2023-12-31T23:59:59Z)"),
    importance: z.enum(["low", "normal", "high"]).optional().describe("Task importance"),
    isReminderOn: z.boolean().optional().describe("Whether to enable reminder for this task"),
    reminderDateTime: z.string().optional().describe("Reminder date and time in ISO format"),
    status: z
      .enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"])
      .optional()
      .describe("Status of the task"),
    categories: z.array(z.string()).optional().describe("Categories associated with the task"),
  },
  async ({
    listId,
    title,
    body,
    dueDateTime,
    startDateTime,
    importance,
    isReminderOn,
    reminderDateTime,
    status,
    categories,
  }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Construct the task body with all supported properties
      const taskBody: any = { title }

      // Add optional properties if provided
      if (body) {
        taskBody.body = {
          content: body,
          contentType: "text",
        }
      }

      if (dueDateTime) {
        taskBody.dueDateTime = {
          dateTime: dueDateTime,
          timeZone: "UTC",
        }
      }

      if (startDateTime) {
        taskBody.startDateTime = {
          dateTime: startDateTime,
          timeZone: "UTC",
        }
      }

      if (importance) {
        taskBody.importance = importance
      }

      if (isReminderOn !== undefined) {
        taskBody.isReminderOn = isReminderOn
      }

      if (reminderDateTime) {
        taskBody.reminderDateTime = {
          dateTime: reminderDateTime,
          timeZone: "UTC",
        }
      }

      if (status) {
        taskBody.status = status
      }

      if (categories && categories.length > 0) {
        taskBody.categories = categories
      }

      const response = await makeGraphRequest<Task>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks`,
        token,
        "POST",
        taskBody,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create task in list: ${listId}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Task created successfully!\nID: ${response.id}\nTitle: ${response.title}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating task: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "update-task",
  "Update an existing task in Microsoft Todo. Allows changing any properties of the task including title, due date, importance, etc.",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task to update"),
    title: z.string().optional().describe("New title of the task"),
    body: z.string().optional().describe("New description or body content of the task"),
    dueDateTime: z.string().optional().describe("New due date in ISO format (e.g., 2023-12-31T23:59:59Z)"),
    startDateTime: z.string().optional().describe("New start date in ISO format (e.g., 2023-12-31T23:59:59Z)"),
    importance: z.enum(["low", "normal", "high"]).optional().describe("New task importance"),
    isReminderOn: z.boolean().optional().describe("Whether to enable reminder for this task"),
    reminderDateTime: z.string().optional().describe("New reminder date and time in ISO format"),
    status: z
      .enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"])
      .optional()
      .describe("New status of the task"),
    categories: z.array(z.string()).optional().describe("New categories associated with the task"),
  },
  async ({
    listId,
    taskId,
    title,
    body,
    dueDateTime,
    startDateTime,
    importance,
    isReminderOn,
    reminderDateTime,
    status,
    categories,
  }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Construct the task update body with all provided properties
      const taskBody: any = {}

      // Add optional properties if provided
      if (title !== undefined) {
        taskBody.title = title
      }

      if (body !== undefined) {
        taskBody.body = {
          content: body,
          contentType: "text",
        }
      }

      if (dueDateTime !== undefined) {
        if (dueDateTime === "") {
          // Remove the due date by setting it to null
          taskBody.dueDateTime = null
        } else {
          taskBody.dueDateTime = {
            dateTime: dueDateTime,
            timeZone: "UTC",
          }
        }
      }

      if (startDateTime !== undefined) {
        if (startDateTime === "") {
          // Remove the start date by setting it to null
          taskBody.startDateTime = null
        } else {
          taskBody.startDateTime = {
            dateTime: startDateTime,
            timeZone: "UTC",
          }
        }
      }

      if (importance !== undefined) {
        taskBody.importance = importance
      }

      if (isReminderOn !== undefined) {
        taskBody.isReminderOn = isReminderOn
      }

      if (reminderDateTime !== undefined) {
        if (reminderDateTime === "") {
          // Remove the reminder date by setting it to null
          taskBody.reminderDateTime = null
        } else {
          taskBody.reminderDateTime = {
            dateTime: reminderDateTime,
            timeZone: "UTC",
          }
        }
      }

      if (status !== undefined) {
        taskBody.status = status
      }

      if (categories !== undefined) {
        taskBody.categories = categories
      }

      // Make sure we have at least one property to update
      if (Object.keys(taskBody).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No properties provided for update. Please specify at least one property to change.",
            },
          ],
        }
      }

      const response = await makeGraphRequest<Task>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`,
        token,
        "PATCH",
        taskBody,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to update task with ID: ${taskId} in list: ${listId}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Task updated successfully!\nID: ${response.id}\nTitle: ${response.title}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating task: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "delete-task",
  "Delete a task from a Microsoft Todo list. This will remove the task and all its checklist items (subtasks).",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task to delete"),
  },
  async ({ listId, taskId }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Make a DELETE request to the Microsoft Graph API
      const url = `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`
      console.error(`Deleting task: ${url}`)

      // The DELETE method doesn't return a response body, so we expect null
      await makeGraphRequest<null>(url, token, "DELETE")

      // If we get here, the delete was successful (204 No Content)
      return {
        content: [
          {
            type: "text",
            text: `Task with ID: ${taskId} was successfully deleted from list: ${listId}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting task: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "get-checklist-items",
  "Get checklist items (subtasks) for a specific task. Checklist items are smaller steps or components that belong to a parent task.",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task"),
  },
  async ({ listId, taskId }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Fetch the task first to get its title
      const taskResponse = await makeGraphRequest<Task>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`,
        token,
      )

      const taskTitle = taskResponse ? taskResponse.title : "Unknown Task"

      // Fetch the checklist items
      const response = await makeGraphRequest<{ value: ChecklistItem[] }>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`,
        token,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve checklist items for task: ${taskId}`,
            },
          ],
        }
      }

      const items = response.value || []
      if (items.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No checklist items found for task "${taskTitle}" (ID: ${taskId})`,
            },
          ],
        }
      }

      const formattedItems = items.map((item) => {
        const status = item.isChecked ? "✓" : "○"
        let itemInfo = `${status} ${item.displayName} (ID: ${item.id})`

        // Add creation date if available
        if (item.createdDateTime) {
          const createdDate = new Date(item.createdDateTime).toLocaleString()
          itemInfo += `\nCreated: ${createdDate}`
        }

        return itemInfo
      })

      return {
        content: [
          {
            type: "text",
            text: `Checklist items for task "${taskTitle}" (ID: ${taskId}):\n\n${formattedItems.join("\n\n")}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching checklist items: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "create-checklist-item",
  "Create a new checklist item (subtask) for a task. Checklist items help break down a task into smaller, manageable steps.",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task"),
    displayName: z.string().describe("Text content of the checklist item"),
    isChecked: z.boolean().optional().describe("Whether the item is checked off"),
  },
  async ({ listId, taskId, displayName, isChecked }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Prepare the request body
      const requestBody: any = {
        displayName,
      }

      if (isChecked !== undefined) {
        requestBody.isChecked = isChecked
      }

      // Make the API request to create the checklist item
      const response = await makeGraphRequest<ChecklistItem>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`,
        token,
        "POST",
        requestBody,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create checklist item for task: ${taskId}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Checklist item created successfully!\nContent: ${response.displayName}\nID: ${response.id}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating checklist item: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "update-checklist-item",
  "Update an existing checklist item (subtask). Allows changing the text content or completion status of the subtask.",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task"),
    checklistItemId: z.string().describe("ID of the checklist item to update"),
    displayName: z.string().optional().describe("New text content of the checklist item"),
    isChecked: z.boolean().optional().describe("Whether the item is checked off"),
  },
  async ({ listId, taskId, checklistItemId, displayName, isChecked }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Prepare the update body, including only the fields that are provided
      const requestBody: any = {}

      if (displayName !== undefined) {
        requestBody.displayName = displayName
      }

      if (isChecked !== undefined) {
        requestBody.isChecked = isChecked
      }

      // Make sure we have at least one property to update
      if (Object.keys(requestBody).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No properties provided for update. Please specify either displayName or isChecked.",
            },
          ],
        }
      }

      // Make the API request to update the checklist item
      const response = await makeGraphRequest<ChecklistItem>(
        `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${checklistItemId}`,
        token,
        "PATCH",
        requestBody,
      )

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to update checklist item with ID: ${checklistItemId}`,
            },
          ],
        }
      }

      const statusText = response.isChecked ? "Checked" : "Not checked"

      return {
        content: [
          {
            type: "text",
            text: `Checklist item updated successfully!\nContent: ${response.displayName}\nStatus: ${statusText}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating checklist item: ${error}`,
          },
        ],
      }
    }
  },
)

server.tool(
  "delete-checklist-item",
  "Delete a checklist item (subtask) from a task. This removes just the specific subtask, not the parent task.",
  {
    listId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task"),
    checklistItemId: z.string().describe("ID of the checklist item to delete"),
  },
  async ({ listId, taskId, checklistItemId }) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to authenticate with Microsoft API",
            },
          ],
        }
      }

      // Make a DELETE request to the Microsoft Graph API
      const url = `${MS_GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${checklistItemId}`
      console.error(`Deleting checklist item: ${url}`)

      // The DELETE method doesn't return a response body, so we expect null
      await makeGraphRequest<null>(url, token, "DELETE")

      // If we get here, the delete was successful (204 No Content)
      return {
        content: [
          {
            type: "text",
            text: `Checklist item with ID: ${checklistItemId} was successfully deleted from task: ${taskId}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting checklist item: ${error}`,
          },
        ],
      }
    }
  },
)

// Main function to start the server
export async function startServer(config?: ServerConfig): Promise<void> {
  try {
    // Note: Token management is now handled by the TokenManager class
    // Config options are kept for backward compatibility but not used

    // Check if using a personal Microsoft account and show warning if needed
    await isPersonalMicrosoftAccount()

    // Start the server
    const transport = new StdioServerTransport()
    await server.connect(transport)

    console.error("Server started and listening")
  } catch (error) {
    console.error("Error starting server:", error)
    throw error
  }
}

// Main entry point when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error("Fatal error in main():", error)
    process.exit(1)
  })
}
