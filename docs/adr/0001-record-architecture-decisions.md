# 1. Record architecture decisions

Date: 2026-09-23
Status: Accepted

## Context

This project has structural rules — strict layering, Three.js confined to `render/`, a
fixed-timestep simulation, zero allocation in the frame path, hard performance budgets.
Each rule costs something at the moment you hit it: an extra indirection, a slower fix,
a feature that has to be redesigned rather than bolted on.

A rule whose reasoning is undocumented reads as bureaucracy at exactly the moment it is
most inconvenient, and gets removed by someone acting in good faith who has no way to
know what it was protecting.

## Decision

We will record architecturally significant decisions as ADRs in `docs/adr/`, using the
format in `docs/adr/README.md`.

An ADR is required before breaking or amending a **MUST** in `CLAUDE.md`, adding an
architecture-shaping dependency, or changing a performance budget.

## Consequences

Structural changes carry a small documentation cost and cannot be made silently in a
drive-by commit — which is the point.

In exchange, every constraint in this codebase is traceable to a reason. A future
contributor can tell a deliberate trade-off from an accident, and can overturn a decision
knowing what it was buying. Records are immutable: superseded ADRs stay in place and
link forward, so the history of the design remains readable.
