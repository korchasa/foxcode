# Firewall Template (init-firewall.sh)

Based on Anthropic's official reference implementation. Default-deny policy with allowlisted domains.

## Template

```bash
#!/usr/bin/env bash
set -euo pipefail

# Default-deny firewall for devcontainer
# Allows only essential services for AI-assisted development

echo "Initializing firewall..."

# Flush existing rules
iptables -F
iptables -X
ipset destroy 2>/dev/null || true

# Default policy: DROP everything
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS (required for domain resolution)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow SSH (for git operations)
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT

# Create ipset for allowed domains
ipset create allowed_hosts hash:ip

# Resolve and add allowed domains
ALLOWED_DOMAINS=(
  # Claude API
  "api.anthropic.com"
  "claude.ai"
  "statsig.anthropic.com"
  # npm registry
  "registry.npmjs.org"
  # GitHub
  "api.github.com"
  "github.com"
  "objects.githubusercontent.com"
  "raw.githubusercontent.com"
  # Deno (add if Deno stack)
  # "deno.land"
  # "jsr.io"
  # "dl.deno.land"
  # PyPI (add if Python stack)
  # "pypi.org"
  # "files.pythonhosted.org"
  # Go proxy (add if Go stack)
  # "proxy.golang.org"
  # "sum.golang.org"
  # Crates.io (add if Rust stack)
  # "crates.io"
  # "static.crates.io"
)

for domain in "${ALLOWED_DOMAINS[@]}"; do
  # Skip comments
  [[ "$domain" =~ ^# ]] && continue
  for ip in $(dig +short "$domain" 2>/dev/null | grep -E '^[0-9]+\.' || true); do
    ipset add allowed_hosts "$ip" 2>/dev/null || true
  done
done

# Allow HTTPS to allowlisted IPs
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed_hosts dst -j ACCEPT

# Allow HTTP to allowlisted IPs (some registries redirect)
iptables -A OUTPUT -p tcp --dport 80 -m set --match-set allowed_hosts dst -j ACCEPT

echo "Firewall initialized. Default-deny with $(ipset list allowed_hosts | grep -c '^[0-9]') allowed IPs."

# Verification
echo "Verification:"
if curl -sf --max-time 5 https://api.anthropic.com > /dev/null 2>&1; then
  echo "  [OK] anthropic API reachable"
else
  echo "  [WARN] anthropic API not reachable (may need IP refresh)"
fi
if curl -sf --max-time 5 https://example.com > /dev/null 2>&1; then
  echo "  [FAIL] example.com should be blocked!"
  exit 1
else
  echo "  [OK] example.com blocked"
fi
```

## Customization

Uncomment domain blocks in `ALLOWED_DOMAINS` based on project stack. The agent should:

1. Detect the project stack
2. Uncomment the relevant domain block
3. Add any project-specific domains the user requests

## devcontainer.json Requirements

When firewall is enabled, add to devcontainer.json:
```jsonc
{
  "runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"],
  "postStartCommand": "sudo /usr/local/bin/init-firewall.sh"
}
```
