// A Worker built from the Workers-safe entry, as a hosted deployment would build it: each
// caller's key comes from a header and goes into a client made for that one call.
import { createServer, getRequestHeader } from "somamcp"

import { registerOpenFDATools } from "../../src/register.js"
import { createFDAAPIClient } from "../../src/utils/api-client.js"

type Session = { apiKey?: string }

const server = createServer<Session>({
  authenticate: (request) => Promise.resolve({ apiKey: getRequestHeader(request, "x-openfda-api-key") }),
  enableDashboard: false,
  name: "openfda-worker",
  version: "1.0.0",
})

registerOpenFDATools(server, { client: (session) => createFDAAPIClient({ apiKey: session?.apiKey }) })

export default { fetch: (request: Request) => server.fetch(request) }
