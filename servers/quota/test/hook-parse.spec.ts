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
  it("refuses an open-ended loop around gh that doesn't sleep 30 s, with gh in its condition or body", () => {
    expect(loopRefusal("while true; do gh run list; done").orNull()).toContain("sleeps not at all")
    expect(loopRefusal("until gh run view 5 --exit-status; do sleep 5; done").orNull()).toContain("sleeps 5 s")
    expect(loopRefusal("while ! gh pr checks 12; do sleep 10; done").orNull()).toContain("sleeps 10 s")
  })

  it("allows a loop that sleeps 30 s or more, a bounded for loop, and loops without gh", () => {
    expect(loopRefusal("while [ $SECONDS -lt 600 ]; do gh pr view 1; sleep 30; done").isNone()).toBe(true)
    expect(loopRefusal("until gh run view 5; do sleep 1m; done").isNone()).toBe(true)
    expect(loopRefusal("for r in a b c; do gh repo view $r; done").isNone()).toBe(true)
    expect(loopRefusal("while read f; do echo $f; done < list; gh pr view 1").isNone()).toBe(true)
    expect(loopRefusal("gh pr view 1 # for later, while waiting").isNone()).toBe(true)
  })
})

group("review follow-ups", () => {
  it("doesn't read a here-string as a heredoc", () => {
    expect(ghCalls(['jq . <<< "foo"', "gh run watch 5"].join("\n")).map((c) => c.args[0])).toEqual(["run"])
  })

  it("finds loops inside bash -c, and after then or do", () => {
    expect(loopRefusal(`bash -c 'while true; do gh pr view 1; done'`).isSome()).toBe(true)
    expect(loopRefusal("if true; then while true; do gh pr view 1; done; fi").isSome()).toBe(true)
    expect(loopRefusal("for x in a; do until gh run view 5; do sleep 1; done; done").isSome()).toBe(true)
  })

  it("finds calls in bash -lc, a quoted watch command, and eval", () => {
    expect(ghCalls("bash -lc 'gh pr list'").map((c) => c.args.slice(0, 2))).toEqual([["pr", "list"]])
    expect(one("watch -n 5 'gh run list'")?.refuse).toContain("`watch` around `gh run list` polls every 5 s")
    expect(ghCalls(`eval "gh issue list"`).map((c) => c.args[0])).toEqual(["issue"])
  })

  it("treats while read as bounded by its input, and keeps an outer loop open past an inner for", () => {
    expect(loopRefusal("gh pr list | while read n; do gh pr view $n; done").isNone()).toBe(true)
    expect(loopRefusal("while true; do for x in a; do echo $x; done; gh pr view 1; done").isSome()).toBe(true)
  })
})

group("heredocs", () => {
  it("reads a heredoc body as data, not commands", () => {
    const command = [
      `gh pr create --title x --body "$(cat <<'EOF'`,
      "while true; do",
      "  gh run watch 5",
      "done",
      "for later",
      "EOF",
      `)"`,
    ].join("\n")
    expect(ghCalls(command).map((c) => describe(c).orNull()?.label)).toEqual(["gh pr create"])
    expect(loopRefusal(command).isNone()).toBe(true)
  })

  it("doesn't refuse a commit whose message mentions gh run watch", () => {
    const command = ["git commit -F - <<'MSG'", "gh run watch 5 now refuses", "MSG"].join("\n")
    expect(ghCalls(command)).toEqual([])
    const tabbed = ["cat <<-END", "\tgh run watch 5", "\tEND", "gh pr view 1"].join("\n")
    expect(ghCalls(tabbed).map((c) => c.args[0])).toEqual(["pr"])
  })
})

group("wrappers", () => {
  it.each([
    ["if gh pr view 1; then echo ok; fi", "gh pr view"],
    ["{ gh pr view 1; }", "gh pr view"],
    ["bash -c 'gh pr list --limit 5'", "gh pr list"],
    ["sudo -u me gh pr list", "gh pr list"],
    ["timeout -k 5 30 gh pr list", "gh pr list"],
    ["env -u X FOO=1 gh run list", "gh run list"],
    ["xargs -n1 gh pr view", "gh pr view"],
  ])("finds the gh call in %s", (command, label) => {
    expect(ghCalls(command).map((c) => describe(c).orNull()?.label)).toEqual([label])
  })

  it("refuses watch around gh under 30 s, and allows it at 30 s or more", () => {
    expect(one("watch -n 5 gh pr checks 1")?.refuse).toContain("`watch` around `gh pr checks` polls every 5 s")
    expect(one("watch gh pr view 1")?.refuse).toContain("polls every 2 s")
    expect(one("watch -n 60 gh pr view 1")?.refuse).toBeUndefined()
  })
})

group("labels never carry arguments", () => {
  it("labels an unknown subcommand by its family, and an unknown family as gh", () => {
    expect(one("gh browse src/secret-file.ts")?.label).toBe("gh browse")
    expect(one("gh pr secret-subcommand")?.label).toBe("gh pr")
    expect(one("gh my-extension private-arg")?.label).toBe("gh")
  })

  it("names only known HTTP methods, and counts an unknown one as a write", () => {
    expect(one(`gh api -X "weird value" repos/a/b`)).toEqual({ label: "gh api", class: "write", resource: "core" })
  })

  it("finds the subcommand past -R and its value", () => {
    expect(one("gh pr -R me/repo merge 5")).toMatchObject({ label: "gh pr merge", class: "write" })
  })

  it("classes inline fields as a POST write, and the new write subcommands", () => {
    expect(one("gh api repos/a/b/issues -ftitle=x")).toMatchObject({ label: "gh api POST", class: "write" })
    expect(one("gh api repos/a/b/issues -Fbody=@f")).toMatchObject({ class: "write" })
    expect(one("gh pr update-branch 5")?.class).toBe("write")
    expect(one("gh project item-add 1")?.class).toBe("write")
  })

  it("falls back to the default interval for --interval 0", () => {
    expect(one("gh run watch 1 --interval 0")?.refuse).toContain("polls every 3 s")
  })
})
