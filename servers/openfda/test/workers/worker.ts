// A Worker built from the Workers-safe entry, as a hosted deployment would build it: each
// caller's key comes from a header and goes into a client made for that one call.
import { createServer, getRequestHeader } from "somamcp"

// Only what `openfda-mcp-server/tools` exports, so this is the Worker a consumer can build.
import { createFDAAPIClient, registerOpenFDATools, VERSION } from "../../src/register.js"
import { CALIBRATE_PATH, calibrationTask } from "./calibration.js"

type Session = { apiKey?: string }

const server = createServer<Session>({
  authenticate: (request) => Promise.resolve({ apiKey: getRequestHeader(request, "x-openfda-api-key") }),
  enableDashboard: false,
  name: "openfda-worker",
  version: VERSION,
})

registerOpenFDATools(server, { client: (session) => createFDAAPIClient({ apiKey: session?.apiKey }) })

export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname === CALIBRATE_PATH
      ? Promise.resolve(new Response(String(calibrationTask())))
      : server.fetch(request),
}
