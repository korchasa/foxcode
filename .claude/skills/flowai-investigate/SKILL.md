---
name: flowai-investigate
description: Iterative issue investigation with user-controlled hypothesis selection
disable-model-invocation: true
---

# Investigate Issue

## Overview

Diagnose the root cause through a controlled, iterative process where the user
selects hypotheses and approves experiments.

## Context

<context>
Used for debugging and root cause analysis. The process is iterative and relies on user guidance to navigate the hypothesis space.
</context>

## Rules & Constraints

<rules>
1. **No Production Changes**: Diagnostic changes must be rolled back or isolated.
2. **Clean Baseline**: Worktree must be clean between experiments.
3. **User Control**: The agent MUST NOT proceed to experiment execution without explicit user selection of a hypothesis and approval of the experiment design.
4. **Transparency**: Always display the current "Hypothesis Board" with probabilities and evidence before asking for the next step.
5. **Mandatory**: The agent MUST use a task management tool (e.g., todo write) to track the execution steps and current iteration state.
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., todo write) to create a plan based on these steps.
   - Gather initial data (logs, error messages, environment details).
2. **Hypotheses Generation**
   - Propose 3-7 candidate root causes (hypotheses) with initial probabilities
     and reasoning.
   - **MANDATORY STOP**: Present the list to the user and ask: "Which hypothesis
     should we investigate first?"
   - Wait for explicit user selection. Do NOT proceed to Step 3, recommend a
     hypothesis yourself, or skip this checkpoint.
3. **Experiment Design**
   - For the selected hypothesis, design a discrete-outcome experiment.
   - Explain what "Success" and "Failure" outcomes will mean for the hypothesis.
   - **Checkpoint**: Get user approval for the experiment design.
4. **Execution & Update**
   - Run the approved experiment.
   - Collect outcomes and update the Hypothesis Board (adjust probabilities, add
     evidence).
   - Restore baseline (revert diagnostic changes).
5. **Iteration Loop**
   - Show the updated Hypothesis Board and a summary of the last experiment's
     findings.
   - Ask the user: "Would you like to continue with another hypothesis from the
     list, generate new ones, or do we have enough info to propose a fix?"
6. **Final Report**
   - Once the root cause is identified, provide a summary of evidence and
     recommend a fix. </step_by_step>

## Verification

<verification>
[ ] Hypotheses presented and selected by user.
[ ] Experiment designed and approved before execution.
[ ] Hypothesis Board updated after each iteration.
[ ] Baseline restored after each experiment.
[ ] Final recommendation based on experimental evidence.
</verification>
