# Dokploy MCP Server — Issue Report

**Package**: `dokploy-mcp-server` (npm)
**Reporter**: Jordan Burke (SapientsAI)
**Date**: 2026-03-12
**Sources**: a production cluster recovery (Feb 2026), Concord memory-mcp-server deployment (Mar 2026), ongoing operational use across two Dokploy clusters

---

## 1. Bugs (things that are broken)

### 1.1 `dokploy_project list` crashes on null fields

**Severity**: High
**Description**: Calling `dokploy_project` with action `list` throws an unhandled error when any project in the Dokploy instance has null or undefined fields.

**Error message**:

```
Cannot read properties of undefined (reading 'toLowerCase')
```

**Reproduction**:

1. Have at least one project in Dokploy (some field combinations trigger this)
2. Call `dokploy_project` with action `list`
3. Tool crashes instead of returning the project list

**Workaround**: Use `get` with a known `projectId` instead of `list`. Or check the Dokploy web UI.

---

### 1.2 `dokploy_ssh_key` actions broken — organizationId not resolved

**Severity**: Critical
**GitHub Issue**: [#4](https://github.com/sapientsai/mcp-servers/issues/4) (already filed)

**Description**: All SSH key operations fail when authenticating via API key. The MCP tool cannot resolve `organizationId` from API key auth, which is required by the underlying Dokploy tRPC endpoints.

**Specific failures**:

- `generate` — Returns `undefined` for all fields (name, publicKey, privateKey all undefined)
- `create` — Fails with `Cannot read properties of undefined`
- `list` — Returns empty array despite keys existing in Dokploy

**Reproduction**:

1. Authenticate to Dokploy MCP tool via API key (the only supported auth method)
2. Call `dokploy_ssh_key` with any action (`generate`, `create`, `list`)
3. All return incorrect/empty results

**Root cause**: The tool doesn't resolve `organizationId` from the API key authentication context. The Dokploy API requires `organizationId` on SSH key endpoints, but the MCP tool doesn't extract it from the authenticated session.

**Workaround**: Use direct `curl` calls to the Dokploy tRPC API with `organizationId` manually extracted from project data:

```bash
curl -s -X POST \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d '{"name":"my-key","privateKey":"...","publicKey":"...","organizationId":"<extracted-from-project>"}' \
  'https://cluster.example.com/api/sshKey.create'
```

---

### 1.3 `dokploy_compose loadServices` returns 404 on valid compose

**Severity**: Medium
**Description**: Calling `loadServices` on a valid compose service that has been created but hasn't had a successful deployment yet returns a 404 error.

**Error message**:

```json
{
  "message": "Services not found",
  "code": "NOT_FOUND",
  "httpStatus": 404,
  "path": "compose.loadServices"
}
```

**Reproduction**:

1. Create a new compose service via `dokploy_compose` (action: `create`)
2. Before deploying, call `dokploy_compose` with action `loadServices` on the new compose ID
3. Returns 404 instead of an empty service list or a meaningful "not yet deployed" message

**Context**: Encountered during memory-mcp-server deployment on Concord cluster (compose ID: `0UkHM4TKW4p-tkMvP4gTi`). The compose existed and had a valid git source, but `loadServices` failed because no successful deploy had occurred yet.

**Workaround**: Deploy first (even if it fails), then `loadServices` works on subsequent calls.

---

### 1.4 First deploy after creating any new application/compose consistently fails

**Severity**: High
**Description**: Across two clusters and 15+ services, the first deployment after creating a new Dokploy application or compose service consistently fails. The second deployment attempt succeeds without any changes.

**Reproduction**:

1. Create a new application via `dokploy_application` (action: `create`) or compose via `dokploy_compose`
2. Configure image, build type, env vars, domain
3. Deploy — fails
4. Deploy again immediately — succeeds

**Observed on**:

- All 7 MS MCP server Docker image deployments (a production cluster, Feb 2026)
- Panel MCP server Docker image deployment (a production cluster, Feb 2026)
- memory-mcp-server compose deployment (Concord cluster, Mar 2026)

**Workaround**: Always deploy twice. The first deploy can be treated as an initialization step.

**Note**: This may be a Dokploy platform bug rather than an MCP tool bug, but the MCP tool should ideally surface the underlying error clearly to help diagnose whether a retry is appropriate.

---

### 1.5 `dokploy_docker getConfig` returns 400 Bad Request

**Severity**: Medium
**Description**: Calling `dokploy_docker` with action `getConfig` returns a 400 Bad Request error.

**Error message**:

```
Dokploy API error (400 Bad Request) on GET /docker.getConfig
```

**Context**: Encountered during memory-mcp-server deployment when attempting to inspect container configuration on the Concord cluster.

**Workaround**: SSH into the server and use `docker inspect` directly.

---

### 1.6 `dokploy_docker` action enum mismatch / parameter validation errors

**Severity**: Medium
**Description**: The `dokploy_docker` tool rejects valid-seeming action names with a parameter validation error, suggesting the allowed action enum doesn't match the documented capabilities.

**Error message**:

```
MCP error -32602: Tool 'dokploy_docker' parameter validation failed: action: Invalid option: expected one of ...
```

**Impact**: Unclear which actions are actually available on the `dokploy_docker` tool. The error message truncates the list of valid options, making discovery difficult.

---

### 1.7 `dokploy_domain update` returns 404 on compose service domains

**Severity**: Medium
**Description**: Calling `dokploy_domain` with action `update` on a domain ID that belongs to a compose service returns a 404 "Domain not found" error, even though the domain exists and was just created.

**Error message**:

```json
{
  "message": "Domain not found",
  "code": "NOT_FOUND",
  "httpStatus": 404,
  "path": "domain.update"
}
```

**Context**: Encountered when trying to update the domain host for memory-mcp-server compose service on Concord cluster. The domain had been created successfully moments earlier.

**Workaround**: Delete and recreate the domain with the correct configuration instead of updating.

---

## 2. Missing Data in Responses (can't read what's needed)

### 2.1 `dokploy_application get` does not return environment variables

**Severity**: High
**Description**: When retrieving an application's details via `dokploy_application` with action `get`, the response does not include the application's environment variables. This makes it impossible to verify env var configuration or audit deployed services via the MCP tool.

**Impact**: Cannot programmatically verify that environment variables were saved correctly. Must fall back to the Dokploy web UI to confirm.

**Expected behavior**: The `get` response should include an `env` field (or similar) containing all environment variables set on the application.

---

### 2.2 `dokploy_compose get` does not return environment variables

**Severity**: High
**Description**: Same as 2.1, but for compose services. `dokploy_compose` with action `get` returns compose metadata but not environment variables.

**Impact**: Cannot verify env vars were correctly set on compose services via the MCP tool.

---

### 2.3 No deployment log retrieval

**Severity**: Medium
**Description**: `dokploy_deployment` with action `list` returns deployment records including a `logPath` field, but there is no way to read the actual log content via the MCP tool.

**Impact**: When deployments fail, the only way to see error details is through the Dokploy web UI. This breaks automated debugging workflows — the MCP tool can tell you a deployment failed but not _why_.

**Expected behavior**: A `getLog` or `readLog` action on `dokploy_deployment` that accepts a `deploymentId` or `logPath` and returns the log content.

---

### 2.4 `dokploy_application get` doesn't return git source configuration

**Severity**: Medium
**Description**: The `get` response for applications does not include git source fields: `sourceType`, `repository`, `owner`, `branch`, `customGitUrl`, `customGitBranch`, `githubId`, `buildType`, `dockerfile`.

**Impact**: Cannot programmatically verify or audit how an application is configured to build and deploy. Must use the Dokploy web UI or raw API calls.

---

## 3. Feature Gaps (actions not supported)

### 3.1 Cannot set `githubId` on application update (git provider linking)

**Severity**: High
**Description**: When using Dokploy's GitHub App integration for private repo access, applications need a `githubId` field set to link them to the installed GitHub provider. The MCP tool's `dokploy_application update` action does not support setting this field.

**Impact**: Cannot configure private GitHub repo deployments via MCP tool. Must use direct API calls:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"applicationId":"...","githubId":"XNB5S_wYr7PR96cHQpnt_"}' \
  'https://cluster.example.com/api/application.update'
```

---

### 3.2 Cannot set git source fields (`sourceType`, `repository`, `owner`, `customGitUrl`, `customGitBranch`)

**Severity**: Critical
**Description**: The MCP tool does not support configuring how an application pulls its source code. The following fields cannot be set via `dokploy_application update`:

- `sourceType` (`github`, `git`, `docker`, `raw`)
- `repository` (GitHub repo name)
- `owner` (GitHub org/user)
- `customGitUrl` (for `sourceType: "git"`)
- `customGitBranch` (branch for custom git)

**Impact**: The most fundamental application configuration — _where does the code come from?_ — cannot be set via the MCP tool. This is the single biggest gap. During a production cluster recovery, every git-built service required raw API calls for source configuration.

**Workaround**: Direct `curl` calls to `application.update`:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"applicationId":"...","sourceType":"git","customGitUrl":"https://github.com/org/repo.git","customGitBranch":"main"}' \
  'https://cluster.example.com/api/application.update'
```

---

### 3.3 Cannot set `composeFile` for raw/inline compose source type

**Severity**: Medium
**Description**: When a compose service uses `sourceType: "raw"` (inline compose file stored in Dokploy's database), the MCP tool cannot set the `composeFile` field containing the Docker Compose YAML content.

**Impact**: Cannot create or update raw/inline compose services via MCP tool. Must use direct API calls.

**Context**: A DDNS service used raw source type with an inline Docker Compose file. During recovery, this had to be set via `curl`.

---

### 3.4 `saveEnvironment` not documented/discoverable

**Severity**: Low
**Description**: It's unclear from the MCP tool's interface how to set environment variables on applications and compose services. The action name `saveEnvironment` is not obvious, and the expected format for the `env` parameter (newline-delimited `KEY=VALUE` string) is not documented.

**Impact**: Users must guess or read the source code to figure out how to set environment variables. This is one of the most common operations.

**Suggestion**: Document the env var format clearly. Consider accepting both string format (`KEY=VALUE\nKEY2=VALUE2`) and structured format (`{"KEY": "VALUE"}`).

---

## 4. Platform Behavior (not MCP bugs, but worth noting for users)

These are Dokploy platform behaviors discovered during MCP-driven operations. They aren't MCP tool bugs, but the MCP tool documentation should warn about them since they affect automated workflows.

### 4.1 Static Docker apps don't pull new images on `deploy`

**Severity**: High (for operations)
**Description**: Applications with `buildType: static` and Docker image source do NOT pull the latest image when `deploy` is called. Dokploy just restarts the existing Swarm service with whatever image is already cached locally.

**Impact**: Calling `dokploy_application deploy` after pushing a new image to a registry does nothing — the old image keeps running. This is extremely confusing for automated CI/CD workflows.

**Workaround**: SSH into the server and force-update:

```bash
docker pull ghcr.io/org/image:main
docker service update --force --image ghcr.io/org/image:main <swarm-service-name>
```

---

### 4.2 Deleting apps doesn't clean up Traefik dynamic configs

**Severity**: High (for operations)
**Description**: When an application is deleted from Dokploy, the Traefik dynamic configuration YAML files remain in `/etc/dokploy/traefik/dynamic/` inside the `dokploy-traefik` container. If a new application is created with the same domain, the stale config causes Traefik to route traffic to the dead service instead of the new one, resulting in Bad Gateway errors.

**Impact**: After any delete + recreate cycle, stale Traefik configs must be manually cleaned up via SSH. During a post-recovery cleanup (Mar 8, 2026), 13 orphan services and their stale Traefik configs caused 403 errors and `[object Object]` responses on multiple production services.

**Workaround**: SSH into the Traefik container and remove stale YAML files:

```bash
docker exec dokploy-traefik rm /etc/dokploy/traefik/dynamic/<stale-config>.yaml
```

---

### 4.3 Deleting apps doesn't remove Docker Swarm services

**Severity**: High (for operations)
**Description**: When an application is deleted from Dokploy, the corresponding Docker Swarm service continues running. Orphan services consume resources (CPU, memory, network) and can conflict with new services on the same overlay network.

**Impact**: After any rebuild or migration, orphan Swarm services accumulate. Must be manually cleaned up via SSH:

```bash
docker service rm <orphan-service-name>
```

---

### 4.4 Duplicate Traefik Host rules are silent

**Severity**: Medium (for operations)
**Description**: When two Traefik dynamic configuration files claim the same `Host()` rule, Traefik does not warn or error. It silently picks one (often the wrong one, especially if the stale config was created first).

**Impact**: Extremely difficult to debug. Symptoms include traffic routing to old/dead containers, 403 errors, or unexpected responses. The only way to detect this is to inspect all Traefik dynamic config files for duplicate Host rules.

**Suggestion**: The MCP tool could check for duplicate Host rules when creating domains and warn the user.

---

## Summary

| Category          | Count  | Critical | High  | Medium | Low   |
| ----------------- | ------ | -------- | ----- | ------ | ----- |
| Bugs              | 7      | 1        | 2     | 4      | 0     |
| Missing Data      | 4      | 0        | 2     | 2      | 0     |
| Feature Gaps      | 4      | 1        | 1     | 1      | 1     |
| Platform Behavior | 4      | 0        | 3     | 1      | 0     |
| **Total**         | **19** | **2**    | **8** | **8**  | **1** |

### Top Priority Items

1. **Cannot set git source fields** (3.2) — Blocks the most fundamental workflow: configuring where an app gets its code
2. **SSH key actions broken** (1.2) — Blocks SSH-based git deployments entirely
3. **First deploy always fails** (1.4) — Every new service requires a wasteful retry
4. **No env var retrieval** (2.1, 2.2) — Cannot verify the most critical configuration
5. **No deployment log access** (2.3) — Cannot debug failures programmatically
