← [Docs index](../README.md) | **Concepts** | [Engine →](../engine/README.md)

# Shared Concepts

Ideas that several engine chapters lean on, documented once here rather than repeated in each.

| Document | One line |
| --- | --- |
| [Sugiyama framework](./sugiyama-framework.md) | The classical four-phase method for layered drawing, and the three places this engine departs from it. |
| [Node measurement](./node-measurement.md) | How text becomes a rectangle before the layout engine ever runs, and why guessing from character counts fails. |
| [Determinism](./determinism.md) | Why the same input must always produce byte-identical output, and the specific rules the codebase follows to guarantee it. |
| [Quality model](./quality-model.md) | Constraints are asserted, metrics are reported, and there is no objective function anywhere. |
| [Computational complexity](./computational-complexity.md) | Per-phase and per-mode cost, with measured figures from the audit harness. |

Suggested reading order is top to bottom; each document links to the next.
