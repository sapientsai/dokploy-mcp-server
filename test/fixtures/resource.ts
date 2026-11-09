// Shapes copied from live Resource API responses on 2026-11-08, with ids and names replaced.
import type { GlobalState, Project, ProjectTimeEntry, StopSessionResponse, TimelineResponse } from "../../src/types"

export const timerState: GlobalState = {
  id: 101,
  state: {
    is_timer: true,
    start_time: "2026-11-09T00:58:24.370Z",
    label_name: "Shape test",
    block_apps_sites: false,
    block_comms: false,
    in_zone: false,
  },
  state_type: 2,
  start_time_epoch: 1794185904,
  expiration_epoch: 1794186204,
  label_name: "Shape test",
  is_timer: true,
}

export const sessionState: GlobalState = {
  id: 102,
  state: { is_timer: false, in_zone: false, block_apps_sites: true, block_comms: false, label_name: "Deep work" },
  state_type: 2,
  start_time_epoch: 1794185904,
  expiration_epoch: 1794189504,
}

export const stopDeleted: StopSessionResponse = {
  focus_session: { name: "Shape test", start_time: "2026-11-08T16:58:24.000-08:00", duration: 300 },
  message: "deleted",
}

export const stopNone: StopSessionResponse = { message: "none" }

export const projects: readonly Project[] = [
  {
    id: 1,
    name: "Client Alpha",
    archived_at: null,
    tasks: [
      { id: 11, name: "(default)", hidden: true, archived_at: null },
      { id: 12, name: "Design review", hidden: false, archived_at: null },
      { id: 13, name: "Development", hidden: false, archived_at: null },
    ],
  },
  { id: 2, name: "Client Beta", archived_at: null, tasks: [] },
  { id: 3, name: "Old Project", archived_at: "2026-01-01T00:00:00Z", tasks: [] },
]

export const projectEntry = (overrides: Partial<ProjectTimeEntry> = {}): ProjectTimeEntry => ({
  name: "Client Alpha",
  date: "2026-11-06",
  start_time: "2026-11-06T05:45:00.000-08:00",
  end_time: "2026-11-06T06:05:00.000-08:00",
  duration: 1200,
  extra: { draft: true, provenance: "open_ai" },
  project: { id: 1, name: "Client Alpha" },
  task: { id: 11, name: "(default)", hidden: true },
  client: null,
  ...overrides,
})

const bucket = (display_name: string, category: string, duration: number, continuation = false) => ({
  display_name,
  category,
  duration,
  continuation,
})

export const timeline: TimelineResponse = {
  activities: {
    "2026-11-08 09:10:00 -0500": bucket("VS Code", "Software Development", 79),
    "2026-11-08 09:15:00 -0500": bucket("VS Code", "Software Development", 187, true),
    "2026-11-08 09:20:00 -0500": bucket("Slack", "Communication", 250),
  },
  activity_intervals: ["2026-11-08T09:00:00-05:00"],
}
