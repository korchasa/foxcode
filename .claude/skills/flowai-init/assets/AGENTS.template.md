# YOU MUST

- STRICTLY FOLLOW YOUR ROLE.
- FIRST ACTION IN SESSION: READ ALL PROJECT DOCS. ONE-TIME PER SESSION.
- AFTER END OF SESSION, REVIEW ALL DOCUMENTS AND MAKE SURE THEY ARE ACCURATE AND UP TO DATE.
- ALWAYS CHECK THE CHANGES MADE BY RUNNING THE APPROPRIATE TESTS OR SCRIPTS.
- ALWAYS KEEP THE PROJECT IN WORKING CONDITION: WITHOUT ERRORS, WARNINGS, AND PROBLEMS IN THE FORMATER AND LINTER OUTPUT
- STRICTLY FOLLOW TDD RULES.
- WRITE ALL DOCUMENTATION IN ENGLISH IN COMPRESSED STYLE.
- IF YOU SEE CONTRADICTIONS IN THE REQUEST OR CONTEXT, SAY ABOUT THEM, ASK THE NECESSARY QUESTIONS AND STOP.
- DO NOT USE STUBS, "CRUTCHES", DECEPTIONS, OR OTHER PREMODS TO BYPASS CHECKS.
- THE CODE MUST FOLLOW THE "FAIL FAST, FAIL CLEARLY" STRATEGY UNLESS THE USER HAS REQUESTED OTHERWISE.
- IF A FIX ATTEMPT FAILS, APPLY "5 WHY" ANALYSIS TO FIND THE ROOT CAUSE BEFORE RETRYING.
- IF ROOT CAUSE IS UNFIXABLE OR OUTSIDE CONTROL: STOP. DO NOT USE WORKAROUNDS. ASK USER FOR HELP.
- IF ISSUE PERSISTS AFTER 2 ATTEMPTS: STOP. OUTPUT "STOP-ANALYSIS REPORT" (STATE, EXPECTED, 5-WHY CHAIN, ROOT CAUSE, HYPOTHESES). WAIT FOR USER HELP.
- WHEN EDITING CI/CD, ALWAYS CHECK LOCALLY FIRST.
- BE PRECISE IN YOUR WORDING. USE A SCIENTIFIC APPROACH. ACCOMPANY HIGHLY SPECIALIZED TERMS AND ABBREVIATIONS WITH SHORT HINTS IN PARENTHESES
- PROVIDE EVIDENCE FOR YOUR CLAIMS
- USE STANDARD TOOLS (jq, yq, jc) TO PROCESS AND MANAGE OUTPUT.
- DO NOT USE TABLES IN CHAT OUTPUT. USE TWO-LEVEL LIST INSTEAD.
- ALWAYS USE RELATIVE PATHS IN COMMANDS WHEN POSSIBLE. ABSOLUTE PATHS ONLY WHEN REQUIRED BY THE TOOL OR CONTEXT.

---
{{PROJECT_RULES}}

## Project Information
- Project Name: {{PROJECT_NAME}}

## Project Vision
{{PROJECT_VISION}}

## Project tooling Stack
{{TOOLING_STACK}}

## Architecture
{{ARCHITECTURE}}

## Key Decisions
{{KEY_DECISIONS}}

## Planning Rules

- **Environment Side-Effects**: Changes to infra/DB/external services → plan MUST include migration/sync/deploy steps.
- **Verification Steps**: Plan MUST include specific verification commands (tests, validation tools, connectivity checks).
- **Functionality Preservation**: Refactoring/modifications → run existing tests before/after; add new tests if coverage missing.
- **Data-First**: Integration with external APIs/processes → inspect protocol & data formats BEFORE planning.
- **Architectural Validation**: Complex logic changes → visualize event sequence (sequence diagram/pseudocode).
- **Variant Analysis**: Non-obvious path → propose variants with Pros/Cons/Risks per variant + Trade-offs across variants. Quality > quantity. 1 variant OK if path is clear.
- **User Decision Gate**: Do NOT detail implementation plan until user explicitly selects a variant.
- **Plan Persistence**: After variant selection, save the detailed plan to `documents/whiteboards/<YYYY-MM-DD>-<slug>.md` using GODS format. Chat-only plans are lost between sessions.
- **Proactive Resolution**: Before asking user, exhaust available resources (codebase, docs, web) to find the answer autonomously.

## CODE DOCS

- **Module**: `AGENTS.md` (responsibility/decisions).
- **Comments**: Class/Method/Func (JSDoc/GoDoc). Why/How > What. No trivial comments.

## TDD FLOW

1. **RED**: Write test (`test <id>`) for new/changed logic or behavior.
2. **GREEN**: Pass test (`test <id>`).
3. **REFACTOR**: Improve code/tests. No behavior change. (`test <id>`).
4. **CHECK**: `check` command. Fix all warnings and errors.

### Test Rules

- DO NOT test constants/templates. Test LOGIC/BEHAVIOR only.
- Tests in same pkg. Private methods OK.
- Code ONLY to fix tests/issues.
- NO STUBS. Real code.
- Run ALL tests before finish.
