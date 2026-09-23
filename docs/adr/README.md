# Architecture Decision Records

One file per significant decision: `NNNN-short-title.md`, numbered sequentially,
never renumbered or deleted. Superseded records stay and get a link forward.

## When to write one

- Breaking or amending a **MUST** in `CLAUDE.md`
- Adding a dependency that shapes the architecture (physics, networking, a new renderer)
- Changing a performance budget
- Any decision a future contributor would otherwise reverse without knowing the cost

## Format

```markdown
# NNNN. Title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by ADR-NNNN

## Context
The forces at play. What makes this a real decision rather than an obvious one.

## Decision
What we are doing, stated actively: "We will ..."

## Consequences
What becomes easier. What becomes harder. What we accept as the cost.
```

Write it before the change, not after. An ADR that rationalizes merged code is a
changelog entry wearing a costume.
