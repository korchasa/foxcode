# Scenario Template (Conceptual)

This template demonstrates the **data structure** required for a benchmark scenario. You can implement this as:

- A Class/Struct in your code (Python, TS, Go).
- A JSON/YAML configuration file.
- A database entry.

```pseudocode
// Define a test case for a Smart Home Agent
Scenario smart-home-evening-scene:
    id: "smart-home-evening"
    name: "Evening Scene Activation"
    description: "Agent must set up the living room for a movie night."
    targetAgentPath: "agents/smart_home_controller.md"

    Setup(sandboxPath):
        // 1. Initialize device states in a mock database or config file
        WriteFile(sandboxPath + "/devices.json", {
            "lights": {"living_room": "bright"},
            "curtains": {"living_room": "open"},
            "tv": {"state": "off"}
        })

    userQuery: "It's movie time! Dim the living room lights, close the curtains, and turn on the TV."

    checklist: [
        {
            id: "lights_dimmed",
            description: "Living room lights are set to 'dimmed' or 'off'",
            critical: true
        },
        {
            id: "curtains_closed",
            description: "Living room curtains are 'closed'",
            critical: true
        },
        {
            id: "tv_on",
            description: "TV state is 'on'",
            critical: true
        }
    ]
```
