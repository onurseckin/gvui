# Dagre Integration

GVUI offers multiple layout engines. While our custom hierarchical engine provides the highest quality visualizations, it can be computationally expensive for massive graphs. To balance this, we also integrate **Dagre**, a JavaScript port of Graphviz's famous `dot` algorithm for layered graph drawing.

## Why Dagre?

Dagre is fast, well-tested, and produces "good-enough" results for quick exploration. It is the industry standard for directed acyclic graph (DAG) visualization in the browser. 

We offer it in two modes:
- **Top-Down Dagre**: A vertical hierarchical layout.
- **Left-to-Right**: A horizontal hierarchical layout.

### When to Use Which?

| Engine | When to Use | Trade-offs |
|--------|-------------|------------|
| **Dagre (Top-Down / LR)** | Rapid exploration, massive graphs (1000+ nodes), real-time interactive editing. | Very fast. Edges might route sub-optimally. Less compact. |
| **Custom Engine** | Presentation-ready diagrams, complex crossing minimization, tight visual packing. | High visual quality. Computationally heavier. |

## Documentation Index

This section covers how we use Dagre. Because Dagre is a third-party library, we treat its internal layout algorithm as a black box. Our documentation focuses on what it does conceptually, and the integration layer we built around it to make it work seamlessly with GVUI's rich node cards.

1. **[Dagre Internals](./01-dagre-internals.md)** — A brief conceptual tour of what happens inside `dagre.layout()`.
2. **[Our Integration Layer](./02-our-integration-layer.md)** — How we calculate dimensions, clip edges, and position badges around Dagre's core.
