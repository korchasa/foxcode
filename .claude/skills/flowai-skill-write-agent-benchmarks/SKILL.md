---
name: flowai-skill-write-agent-benchmarks
description: Create, maintain, and run evidence-based benchmarks for AI agents. Use when setting up testing infrastructure, writing new test scenarios, or evaluating agent performance.
---

# Universal Agent Benchmarking Skill

## 1. Context & Philosophy

This skill defines a universal, language-agnostic standard for benchmarking Autonomous AI Agents. The goal is to objectively measure an agent's ability to solve real-world tasks, whether they are coding, data analysis, or conversational.

### Core Principles

1. **Evidence-Based Verification**: We do not trust the agent's words. We verify its actions.
   - **Bad**: The agent says "I fixed the bug." -> Judge believes it.
   - **Good**: The agent says "I fixed the bug." -> Judge runs the test suite in the environment and verifies the exit code is 0.
2. **Strict Isolation**: Test run MUST execute in a completely isolated environment (Docker, VM, etc.). This ensures a clean, reproducible state and prevents side effects.
3. **Black Box Protocol**: The benchmark knows *nothing* about the agent's internals (prompts, tools, language). It only observes:
   - **Input**: User Query + Environment State.
   - **Output**: New Environment State + Response Text.
4. **Determinism**: Benchmarks should be reproducible. Mock external network calls where possible and use fixed seeds.
5. **Universal Applicability**: The standard applies to any agent type:
   - **CLI/IDE Agents**: Interact via shell/files.
   - **API Agents**: Interact via HTTP/JSON.
   - **Chat Agents**: Interact via conversation.

## 2. Evaluation Modes

The system supports three primary evaluation modes:

1. **Quality Evaluation (Checklist-based)**:
   - **Goal**: Verify if an agent meets minimum quality standards.
   - **Method**: Evaluates a single agent against a predefined checklist of criteria (Critical Errors vs Warnings).
   - **Use Case**: CI/CD pipelines, regression testing.

2. **Model Selection (Pairwise Comparison)**:
   - **Goal**: Determine which LLM/Model performs best.
   - **Method**: **LLM-as-a-Judge Side-by-Side (SBS)**. The Judge compares outputs from two models and selects a winner.

3. **Version Comparison (Regression Tracking)**:
   - **Goal**: Measure impact of changes to prompt or logic.
   - **Method**: Compare current version (HEAD) against a baseline (BASE).

## 3. Interaction Strategies

Choosing the right interaction strategy is critical for stable benchmarks.

### 3.1 Atomic Request Verification (Step-by-Step)
- **Method**: Send a single input, wait for output, verify immediately.
- **Best for**: Stateless APIs, simple function calling agents, or deterministic workflows where the agent's path is fixed.
- **Limitation**: Fails with autonomous agents that might "think" for 3 steps before acting. If you expect a file write on Step 1, but the agent does it on Step 2, the test fails falsely.

### 3.2 User Emulation (End-to-End Session)
- **Method**: The Runner starts a session and acts as a **Simulated User**. It observes the agent's loop without interfering until the agent signals completion or asks for input.
- **Best for**: Autonomous agents, complex problem solvers, and chat-based assistants.
- **Reasoning**: In an autonomous loop, we cannot predict *when* the agent will perform the target action (e.g., writing a file). It might first explore, then plan, then act.
- **Protocol**: The Runner waits for the agent to say "I'm done" or "I need X", providing replies via the Simulated User persona, and only verifies the final state after the session ends.

## 4. Architecture & Requirements

A robust benchmarking system consists of five key modules.

### 4.1 The Environment (Sandbox)

The isolated state container where the task is performed. It is not limited to a file system.

- **File System Context**: A directory with files (for coding tasks).
- **Network Context**: Mock servers or intercepted HTTP traffic (for API tasks).
- **Data Context**: Ephemeral databases (e.g., Postgres, Redis containers) for data tasks.
- **Browser Context**: Headless browser instances (for web agents).
- **Lifecycle**: Must support `Setup` (initial state), `Reset` (between runs), and `Teardown`.

### 4.2 The Runner (Orchestrator)

The central controller managing the test lifecycle.

- **Interface Adapters**: Adapts the Agent's native output to the Environment.
  - *Shell Adapter*: Executes bash commands.
  - *SQL Adapter*: Executes SQL queries against the Data Context.
  - *HTTP Adapter*: Sends requests to the Network Context.
- **Concurrency**: Should run multiple scenarios in parallel.

### 4.3 The Simulated User (Persona)

For interactive agents that ask clarifying questions.

- **Role**: Replaces the human in the loop.
- **Persona**: Defined by a specific goal, knowledge level, and constraints (e.g., "Junior Dev who doesn't know Docker").
- **Behavior**: Provides consistent, deterministic answers to the agent's questions during the run.

### 4.4 The Judge (Evaluator)

The logic that determines if a test passed or failed based on **Evidence**.

- **Artifact Evidence**: Files created, DB rows inserted, resources deployed.
- **Interaction Evidence**: API logs, tool call arguments, HTTP request bodies.
- **Semantic Evidence**: The quality/accuracy of the text response (evaluated by LLM).

### 4.5 Observability (The Trace)

Complete capture of the agent's lifecycle in a **single human-readable file** (e.g., `trace.md` or `trace.json`).

- **Must Capture**: Full conversation history, exact Judge prompts/responses, command outputs, environment diffs.
- **Normalization**: Output should be normalized for consistent evaluation.

## 5. Workflow: Creating a New Benchmark

Follow this process to add a new benchmark scenario.

### Step 1: Define the Goal

What specific capability are you testing?

- _Example_: "Can the agent fix a syntax error?" or "Can the agent negotiate a price?"

### Step 2: Design the Environment (Pre-condition)

Create the initial state.

- **Static Setup**: Copy fixture files, seed database with initial rows.
- **Dynamic Setup**: Start mock servers, configure environment variables.

### Step 3: Define the Task (Trigger)

Write the prompt that instructs the agent.

- _Prompt_: "Run the script and fix errors" or "Book a flight to Paris".

### Step 4: Define Success Criteria (Post-condition)

How do we know it worked?

1. **Hard Check (Artifact)**: File `script.py` runs with exit code 0.
2. **Hard Check (State)**: Database table `users` has 1 new row.
3. **Soft Check (Semantic)**: Agent's explanation is polite and accurate.
4. **Interaction Check**: Agent called `GET /api/v1/flights` with correct parameters.

### Step 5: Register

Add the scenario to your Runner's registry.

## 6. Workflow: Running & Debugging

### Execution Loop

1. **Init**: Runner prepares the Environment (Docker, DB, Mocks).
2. **Seed**: Runner executes Scenario Setup.
3. **Act**: Agent runs in the environment.
   - *Interactive Loop*: Agent <-> Simulated User.
   - *Command Loop*: Agent <-> Environment (Shell/API).
4. **Stop**: Agent signals completion or timeout.
5. **Evidence**: Runner collects state diffs (git, DB dump) and logs.
6. **Judge**: Runner passes Evidence to the Judge.
7. **Report**: Result is saved. Environment is destroyed.

### Debugging Failures

If a benchmark fails, check the **Trace**:

1. **Did the Setup work?** Check initial environment state.
2. **Did the Agent try?** Check logs for actions/tool calls.
3. **Did the Simulated User confuse the Agent?** Check the conversation log.
4. **Did the Judge hallucinate?** Check the Judge's reasoning against the actual evidence.

## 7. Universal Result Schema

To ensure cross-platform compatibility, benchmark results must follow a standard JSON schema.

```json
{
  "scenario_id": "string",
  "outcome": "pass|fail",
  "score": 0-100,
  "metrics": {
    "duration_ms": 1200,
    "cost_usd": 0.01,
    "steps_taken": 5,
    "tokens_used": 1500
  },
  "evidence": {
    "artifacts": ["file_paths"],
    "logs": ["log_entries"]
  },
  "checklist": [
    { "id": "check_1", "status": "pass", "reason": "..." }
  ]
}
```

## 8. Configuration Principles

1. **Preset-Based Management**: Manage LLM configurations as named presets.
2. **Role Separation**: Distinguish between **Agent** (tested), **Judge** (evaluator), and **Simulated User** (context provider).
3. **Reproducibility**: Enforce deterministic behavior (e.g., `temperature: 0`).

## 9. Assets & References

- **[examples/scenario-example.md](assets/scenario-example.md)**: Template for defining scenarios.
- **[benchmarks/config.json](benchmarks/config.json)**: Main configuration file for models and presets.
