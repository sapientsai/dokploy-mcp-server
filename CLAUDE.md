# CLAUDE.md

A pnpm workspace of small MCP servers built on somamcp. Each server is one npm package under `servers/<name>`, with its own CLAUDE.md, README, version and releases. Read the server's CLAUDE.md before working in it.

## Layout

- `servers/<name>/`: one server. It keeps its own `package.json`, config, tests, `server.json` (if listed in the MCP Registry) and `LICENSE` (npm packs it from the package folder).
- Root: the workspace (`pnpm-workspace.yaml`), the one lockfile, shared CI, and `scripts/release.mjs`.

## Rules

- **Stay in the server you were asked to change.** A change to one server must not touch another's files. Shared changes (root config, the lockfile, workflows) get their own PR.
- **One lockfile.** Install from the root. A dependency bump for every server is one PR at the root, not one per server.
- **Releases are per server, by tag.** `pnpm release <server> <patch|minor|major>` bumps, commits and tags `<package>@<version>`; `git push --follow-tags` publishes that package alone through `.github/workflows/publish.yml`. Never `npm publish` by hand, and never rename `publish.yml`: npm trusted publishing is configured against that file name.
- **A Dockerfile for each server something self-hosts over HTTP** (today dokploy, openfda and patents; temporal runs on Cloudflare Workers, and nothing self-hosts rescuetime). It builds from the repo root (`docker build -f servers/<name>/Dockerfile .`) and installs only that server. Each one has a `docker-<name>.yml` job that builds the image and smoke-tests it on changes to that server or the shared lockfile. No image is published; a deployment builds from the Dockerfile, best at a release tag.
- **Keep each package's identity.** A server keeps its npm name when it moves in. Its `mcpName` must be `io.github.sapientsai/<name>`: the MCP Registry login in `publish.yml` (GitHub OIDC) can only publish under this repo's owner. temporal moved from `io.github.jordanburke/…` for that reason. Its `package.json` `repository` has `"directory": "servers/<name>"`, and its `server.json` `repository` has `"subfolder": "servers/<name>"`.

## Commands

```bash
pnpm install       # at the root
pnpm run ci        # every server's ci, plus the root format check
pnpm validate      # the same, fixing what it can
```

## Adding a server

Import it with its history (`git subtree add --prefix servers/<name>`, fetched with `--no-tags`, so its old `v*` tags don't land here). If its history or files hold something that mustn't land in this public repo, import a cleaned snapshot instead (`git archive`), as patents was. Then:

1. Give it a `ci` script, if it has none.
2. Set `repository.directory` and `server.json` `subfolder`.
3. Add it to the root README's table.
4. Move its npm trusted publisher to this repo and `publish.yml` before its first release from here. `NPM_TOKEN` is only a fallback.
5. If something self-hosts it over HTTP, give it a Dockerfile that builds from the repo root and a `docker-<name>.yml` smoke job, like dokploy's.
