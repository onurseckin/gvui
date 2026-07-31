# Dagre Integration

GVUI offers multiple layout engines to cater to different performance and presentation needs. While our custom hierarchical engine provides the highest quality visualizations with orthogonal routing and intelligent badge placement, it can be computationally expensive for massive graphs. 

To solve this, we integrate **Dagre**, a JavaScript port of Graphviz's famous `dot` algorithm for layered graph drawing.

## What is Dagre?

At its core, Dagre takes a list of nodes and edges, and assigns (x, y) coordinates to them so they form a readable hierarchy (a Directed Acyclic Graph, or DAG). It handles the heavy lifting of figuring out which nodes go in which "row" (rank) and how to minimize the crossing of lines between them.

## When to use Dagre vs. Custom Engine

Imagine you are a site reliability engineer debugging a massive microservice architecture. 

**Scenario A: The 5,000-Node Incident Graph**
You just queried all services involved in a cascading failure. You need to see the data *right now*. 
- **Use Dagre.** It will layout thousands of nodes in milliseconds. The edges might be straight diagonal lines rather than neat right-angles, and some labels might be slightly crowded, but you'll get an immediate, actionable overview of the system state.

**Scenario B: The Executive Architecture Presentation**
You have isolated the root cause to a flow of 15 services and need to export a diagram for a post-mortem report.
- **Use the Custom Engine.** It will take a few more milliseconds, but it will route edges cleanly around nodes, align everything perfectly on a grid, and ensure no labels overlap.

### The Trade-offs

| Engine | Ideal For | Strengths | Weaknesses |
|--------|-----------|-----------|------------|
| **Dagre (Top-Down / LR)** | Rapid exploration, massive graphs, real-time interactive editing. | Blazing fast, industry standard, highly stable. | Edges are non-orthogonal (diagonal lines), no native badge-aware routing, less visually compact. |
| **Custom Engine** | Presentation-ready diagrams, complex crossing minimization. | High visual quality, orthogonal routing, tight visual packing. | Computationally heavier, slower on large datasets. |

## Documentation Index

This section covers how we use Dagre. Because Dagre is a third-party library, we treat its internal layout algorithm as a black box. Our documentation focuses on what it does conceptually, and the integration layer we built around it to make it work seamlessly with GVUI's rich node cards.

1. **[Dagre Internals: The Black Box](./01-dagre-internals.md)**
   A brief conceptual tour of what happens inside `dagre.layout()`. We cover Network Simplex, Median Ordering, and Brandes-Köpf with concrete examples.
2. **[Our Integration Layer](./02-our-integration-layer.md)**
   How we calculate dimensions, clip edges, and position badges around Dagre's core. We bridge the gap between Dagre's pure geometric output and GVUI's rich UI.
