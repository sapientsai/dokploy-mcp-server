import { describe as group, expect, it } from "vitest"

import { describe, ghCalls, loopRefusal, segments } from "../src/hook/parse"

const one = (command: string) => {
  const [call] = ghCalls(command)
  return call === undefined ? undefined : describe(call).orNull()
}

group("finding gh calls", () => {
  it("splits at the shell's separators, and keeps quoted text whole", () => {
    expect(segments(`gh pr view 96 && echo "a; b" | grep x; ls`)).toEqual([
      ["gh", "pr", "view", "96"],
      ["echo", "a; b"],
      ["grep", "x"],
      ["ls"],
    ])
  })

  it("finds gh in command substitution, in and out of double quotes", () => {
    expect(ghCalls(`echo $(gh pr list) "$(gh issue list)" \`gh run list\``).map((c) => c.args.slice(0, 2))).toEqual([
      ["pr", "list"],
      ["issue", "list"],
      ["run", "list"],
    ])
  })

  it("resumes the double quote after a substitution closes", () => {
    expect(segments(`echo "a $(gh pr list) b c"; ls`)).toEqual([["echo", "a "], ["gh", "pr", "list"], [" b c"], ["ls"]])
  })

  it("ignores gh inside single quotes, and words that only contain it", () => {
    expect(ghCalls(`echo 'gh pr view'; cat ghost.txt; git log --grep gh`)).toEqual([])
  })

  it("looks past assignments and wrappers", () => {
    expect(ghCalls("GH_PAGER= timeout 30 gh pr view 1").map((c) => c.args)).toEqual([["pr", "view", "1"]])
    expect(ghCalls("cd /repo && sudo env X=1 gh api user").map((c) => c.args)).toEqual([["api", "user"]])
    expect(ghCalls("/usr/bin/gh run list")).toHaveLength(1)
  })
})

group("describing a call", () => {
  it("labels a call by its first words, never its arguments", () => {
    expect(one("gh pr view 96 --json body --repo me/secret-repo")).toEqual({
      label: "gh pr view",
      class: "read",
      resource: "graphql",
    })
    expect(one("gh run list --limit 5")).toEqual({ label: "gh run list", class: "read", resource: "core" })
  })

  it("classes writes", () => {
    expect(one("gh pr create --title x")?.class).toBe("write")
    expect(one("gh issue comment 3 --body hi")?.class).toBe("write")
    expect(one("gh release create v1")?.class).toBe("write")
    expect(one("gh pr list")?.class).toBe("read")
  })

  it("reads gh api's method, path and fields without recording the path", () => {
    expect(one("gh api repos/me/repo/pulls/1/merge -X PUT -f merge_method=merge")).toEqual({
      label: "gh api PUT",
      class: "write",
      resource: "core",
    })
    expect(one("gh api --method=DELETE repos/me/repo/git/refs/heads/x")?.label).toBe("gh api DELETE")
    // gh sends a request with fields as a POST unless told otherwise.
    expect(one("gh api repos/me/repo/issues -f title=x")).toMatchObject({ label: "gh api POST", class: "write" })
    expect(one("gh api -H 'Accept: x' repos/me/repo")).toMatchObject({ label: "gh api GET", class: "read" })
    expect(one("gh api graphql -f query='{ viewer { login } }'")).toEqual({
      label: "gh api graphql",
      class: "read",
      resource: "graphql",
    })
  })

  it("names the free rate_limit call so the broker lets it through", () => {
    expect(one("gh api rate_limit --jq .rate")?.label).toBe("gh api rate_limit")
    expect(one("gh api /rate_limit")?.label).toBe("gh api rate_limit")
  })

  it("skips commands that never reach the API", () => {
    expect(one("gh auth status")).toBeNull()
    expect(one("gh --version")).toBeNull()
    expect(one("gh")).toBeNull()
  })

  it("refuses watching faster than every 30 s", () => {
    expect(one("gh run watch 123")?.refuse).toContain("polls every 3 s")
    expect(one("gh run watch 123 --interval 10")?.refuse).toContain("polls every 10 s")
    expect(one("gh run watch 123 --interval 30")?.refuse).toBeUndefined()
    expect(one("gh run watch 123 -i 60")?.refuse).toBeUndefined()
    expect(one("gh pr checks 5 --watch")?.refuse).toContain("polls every 10 s")
    expect(one("gh pr checks 5 --watch --interval=45")?.refuse).toBeUndefined()
    expect(one("gh pr checks 5")?.refuse).toBeUndefined()
  })
})

group("shell loops", () => {
  it("refuses a loop around gh that doesn't sleep 30 s", () => {
    expect(loopRefusal("while true; do gh run list; done").orNull()).toContain("sleeps not at all")
    expect(loopRefusal("for i in 1 2 3; do gh pr view $i; sleep 5; done").orNull()).toContain("sleeps 5 s")
  })

  it("allows a loop that sleeps 30 s or more, and plain commands", () => {
    expect(loopRefusal("while [ $SECONDS -lt 600 ]; do gh pr view 1; sleep 30; done").isNone()).toBe(true)
    expect(loopRefusal("gh pr view 1 && sleep 1").isNone()).toBe(true)
  })
})
