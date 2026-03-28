#!/bin/bash
# Template for a command-based hook script
# This script reads JSON from stdin and outputs JSON to stdout

# Read JSON input
input=$(cat)

# Example: Extracting a field using jq (if available) or simple parsing
# command=$(echo "$input" | grep -o '"command":"[^"]*"' | cut -d'"' -f4)

# Logic goes here...

# Output JSON response
cat << EOF
{
  "decision": "allow"
}
EOF
exit 0
