# Dockerfile Patterns

## Base Pattern (all stacks)

```dockerfile
FROM {{base_image}}

ARG USERNAME={{remote_user}}
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (skip if base image already has one)
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME
```

## Deno Stack

```dockerfile
FROM debian:bookworm-slim

# ... base pattern ...

# Deno
ENV DENO_INSTALL="/usr/local"
RUN curl -fsSL https://deno.land/install.sh | sh -s -- --yes

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*
```

## AI CLI Installation (append for selected tools)

### Claude Code
```dockerfile
# Claude Code CLI (native installer, recommended)
RUN curl -fsSL https://claude.ai/install.sh | bash
```

Alternative with version pinning via npm:
```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}
```

### OpenCode
```dockerfile
# OpenCode CLI (check https://opencode.ai for latest install method)
RUN curl -fsSL https://opencode.ai/install | bash
```

## Firewall Support (append when security hardening enabled)

```dockerfile
# Firewall dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    sudo \
    && rm -rf /var/lib/apt/lists/*

COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh \
    && echo "${USERNAME} ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" \
    > /etc/sudoers.d/${USERNAME}-firewall \
    && chmod 0440 /etc/sudoers.d/${USERNAME}-firewall
```

## Environment Markers

Always add near the end of Dockerfile:
```dockerfile
ENV DEVCONTAINER=true
WORKDIR /workspace
USER ${USERNAME}
```
