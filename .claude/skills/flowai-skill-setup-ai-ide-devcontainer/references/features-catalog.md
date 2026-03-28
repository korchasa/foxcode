# Devcontainer Features Discovery

Reference for scanning a project and suggesting relevant devcontainer features.
The agent uses project indicators to identify needs, then searches the official
registry at https://containers.dev/features for matching feature IDs.

## Discovery Logic

1. Scan project root (and common subdirs like `src/`, `infra/`, `deploy/`) for indicator files and patterns
2. Map indicators to **needs** (see table below)
3. Search https://containers.dev/features for features matching each need
4. Filter out needs already covered by the primary stack's base image
5. Classify: **auto** (high confidence, lightweight) vs **suggest** (optional, heavy, or ambiguous)
6. Present grouped list to user with detection rationale (which file triggered each suggestion)
7. User confirms or customizes before generation

## AI IDE Features

Registry features exist for some AI CLI tools, but not all are reliable.

- **Claude Code**: Install via `postCreateCommand`: `curl -fsSL https://claude.ai/install.sh | bash`. Do **NOT** use registry features (`ghcr.io/devcontainers-extra/features/claude-code:1`, `ghcr.io/stu-bell/devcontainer-features/claude-code:0`) — they install outdated versions (e.g., 2.1.72) with broken OAuth callback.
- **OpenCode**: `ghcr.io/jsburckhardt/devcontainer-features/opencode:1` (via opencode.ai/install)
- **Cursor CLI**: `ghcr.io/stu-bell/devcontainer-features/cursor-cli:0` (via cursor.com/install)
- **Gemini CLI**: `ghcr.io/stu-bell/devcontainer-features/gemini-cli:0` (via npm)
- **GitHub Copilot CLI**: `ghcr.io/devcontainers/features/copilot-cli:1`

For Claude Code, always use the official install script in `postCreateCommand` — it installs the latest version with working OAuth. Config persistence and global skills mounting still require explicit `mounts` configuration (see SKILL.md).
For other AI CLIs, prefer registry features where available.

## Indicator → Need Mapping

The agent scans for these indicators and maps them to a **need** keyword.
Then searches the registry for a feature matching that need.

### Secondary Runtimes (auto)

Skip if runtime is the primary stack or included in the base image.

- `package.json` (non-primary) → need: Node.js
- `requirements.txt` / `pyproject.toml` / `setup.py` (non-primary) → need: Python
- `go.mod` (non-primary) → need: Go
- `Cargo.toml` (non-primary) → need: Rust
- `deno.json` / `deno.jsonc` (non-primary) → need: Deno
- `pom.xml` / `build.gradle` / `build.gradle.kts` → need: Java

### Build Tools & Package Managers (auto)

- `pnpm-lock.yaml` / `pnpm-workspace.yaml` → need: pnpm
- `bun.lockb` / `bunfig.toml` → need: Bun
- `justfile` / `Justfile` → need: Just (command runner)
- `.envrc` → need: direnv
- `flake.nix` / `shell.nix` / `default.nix` → need: Nix

### Infrastructure & Cloud (suggest)

- `Dockerfile` (in project root, not `.devcontainer/`) / `docker-compose.yml` / `.dockerignore` → need: Docker-in-Docker
- `*.tf` / `.terraform.lock.hcl` → need: Terraform
- `ansible.cfg` / `playbooks/` / `roles/` / `galaxy.yml` / `molecule/` / `requirements.yml` with `roles`/`collections` → need: Ansible
- `k8s/` / `kubernetes/` / `Chart.yaml` / `kustomization.yaml` → need: kubectl, Helm
- `serverless.yml` / `samconfig.toml` / `cdk.json` / dependency `aws-sdk`/`boto3` → need: AWS CLI
- `azure-pipelines.yml` / `*.bicep` / dependency `@azure/*` → need: Azure CLI
- `cloudbuild.yaml` / `app.yaml` (GAE) / dependency `@google-cloud/*` → need: Google Cloud CLI

### Databases (suggest)

- `docker-compose.yml` with `postgres` / `prisma/schema.prisma` with `postgresql` → need: PostgreSQL
- `docker-compose.yml` with `redis` / dependency `ioredis`/`redis`/`bull` → need: Redis
- dependency `mongoose`/`mongodb`/`pymongo` → need: MongoDB

### Testing (suggest — heavy)

- `playwright.config.ts` / dependency `@playwright/test` → need: Playwright (large, installs browsers)

## Known Feature IDs

Shortcut reference for commonly detected needs. Use these IDs directly instead of searching containers.dev each time. For needs not listed here, search https://containers.dev/features.

- **Terraform**: `ghcr.io/devcontainers/features/terraform:1` — installs Terraform CLI, optionally TFLint and Terragrunt
- **Ansible**: No official registry feature. Install via `postCreateCommand`: `pip install ansible ansible-lint` (requires Python in base image or as secondary runtime feature). VS Code extension: `redhat.ansible`
- **Docker-in-Docker**: `ghcr.io/devcontainers/features/docker-in-docker:2`
- **kubectl + Helm**: `ghcr.io/devcontainers/features/kubectl-helm-minikube:1`
- **AWS CLI**: `ghcr.io/devcontainers/features/aws-cli:1`
- **Azure CLI**: `ghcr.io/devcontainers/features/azure-cli:1`
- **Google Cloud CLI**: `ghcr.io/devcontainers/features/gcloud:1` (community: search registry)

## Always Included (base template)

These are always added regardless of scan results:

- `ghcr.io/devcontainers/features/common-utils:2` — zsh, basic utilities
- `ghcr.io/devcontainers/features/github-cli:1` — gh CLI

## Presentation Format

```
Detected features for your project:

Auto-add (based on project files):
  - direnv (found .envrc)
  - pnpm (found pnpm-lock.yaml)

Suggested (confirm to add):
  - PostgreSQL (found prisma schema with postgresql provider)
  - Docker-in-Docker (found docker-compose.yml)

AI CLI (from Step 4):
  - Claude Code (install via postCreateCommand: curl -fsSL https://claude.ai/install.sh | bash)

Already included:
  - GitHub CLI (base template)
  - Common Utilities (base template)
  - Node.js (primary stack)

Add all suggested features? [Y/n/customize]
```

When user confirms, merge all features into the `features` block in devcontainer.json.
For each feature, check https://containers.dev/features for the latest version and
available options.
