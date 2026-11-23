import type { Either } from "functype"
import { Left, Option, Right } from "functype"
import { UserError } from "somamcp"

import type { Project, Task } from "../types"

export type ResolvedLink = {
  readonly project: Project
  readonly task: Option<Task>
}

// eslint-disable-next-line functype/prefer-option -- matches the wire type in types.ts
const active = <T extends { readonly archived_at: string | null }>(items: readonly T[]): readonly T[] =>
  items.filter((i) => i.archived_at === null)

/** An exact case-insensitive name match first, else the single name that contains the query. */
function findByName<T extends { readonly name: string }>(items: readonly T[], query: string): Option<T> {
  const q = query.trim().toLowerCase()
  const exact = items.find((i) => i.name.toLowerCase() === q)
  if (exact) return Option(exact)
  const partial = items.filter((i) => i.name.toLowerCase().includes(q))
  return partial.length === 1 ? Option(partial[0]) : Option.none()
}

const names = (items: readonly { readonly name: string }[]): string =>
  items.length > 0 ? items.map((i) => `"${i.name}"`).join(", ") : "none"

/** Resolve the project and task names a caller passed to start_timer. */
export function resolveTimerLink(
  projects: readonly Project[],
  projectName: string,
  taskName: Option<string>,
): Either<UserError, ResolvedLink> {
  const candidates = active(projects)
  return findByName(candidates, projectName).fold(
    () =>
      Left<UserError, ResolvedLink>(
        new UserError(`No single active project matches "${projectName}".`, {
          category: "not_found",
          suggestions: [`Active projects: ${names(candidates)}`],
        }),
      ),
    (project) =>
      taskName.fold(
        () => Right<UserError, ResolvedLink>({ project, task: Option.none() }),
        (name) => {
          const tasks = active(project.tasks).filter((t) => !t.hidden)
          return findByName(tasks, name).fold(
            () =>
              Left<UserError, ResolvedLink>(
                new UserError(`No single task in "${project.name}" matches "${name}".`, {
                  category: "not_found",
                  suggestions: [`Tasks in "${project.name}": ${names(tasks)}`],
                }),
              ),
            (task) => Right<UserError, ResolvedLink>({ project, task: Option(task) }),
          )
        },
      ),
  )
}
