---
name: flowai-skill-conduct-qa-session
description: How to conduct a Q&A session with the user
---

# How to Conduct a Q&A Session

When you need to clarify requirements, gather missing information, or discuss
design choices with the user, follow these strict guidelines.

## 1. Language

- **Match the User's Language**: Ask questions in the same language as the user's last query, unless explicitly instructed otherwise.

## 2. Formatting & Structure

- **Number Your Questions**: Always use a numbered list for questions (1., 2.,
  3., ...).
- **Batch Size**: Ask **1 to 5 questions** per response. Do not overwhelm the
  user with too many questions at once.
- **Prioritize**: Start with the most critical or blocking questions first.

## 3. Content & Guidance

- **Provide Context**: Never ask a "naked" question. Add background information
  or context to help the user understand _why_ you are asking.
- **Facilitate Decision Making**: Provide data or hints that make it easier for
  the user to answer.

## 4. Option Comparison

- **Compare Variants**: If asking the user to choose between options (A vs. B),
  explicitly compare them in the question description.
  - Highlight Pros/Cons/Risks per option + Trade-offs across options.
  - Explain the impact of each choice.

## Example

**Bad:** "Which database?"

**Good:** "1. **Database Selection**: For the session storage, we have two main
options. Which do you prefer? - **Redis**: Extremely fast, ideal for ephemeral
data with TTL, but adds a new infrastructure dependency. - **PostgreSQL**: We
already use it, simplifies the stack, but slightly slower for high-frequency
reads/writes.

    *Recommendation: Start with Postgres for simplicity, migrate to Redis if load increases.*"
