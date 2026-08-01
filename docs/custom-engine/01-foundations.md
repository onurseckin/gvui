[Index](./README.md) | [Next: The Sugiyama Framework →](./02-the-sugiyama-framework.md)

# Graph Theory Foundations

Before we can build an engine that draws graphs, we have to understand what a graph actually is. If you've never taken a graph theory course, don't worry. This guide assumes zero prior knowledge.

We will build our understanding using a running example: a small microservice architecture.

## What is a Graph?

In computer science, a **graph** is a collection of things and the connections between them.

- The "things" are called **nodes** (or vertices).
- The "connections" are called **edges** (or links).

Here is a tiny graph of our microservices:

```text
  [ API ]
     |
     |
  [ Auth ]
```

In this graph, we have two nodes (`API` and `Auth`) and one edge connecting them.

## Directed vs. Undirected Graphs

Graphs come in two main flavors: **undirected** and **directed**.

An **undirected graph** represents symmetric relationships, like friendship. If Alice is friends with Bob, Bob is friends with Alice. The edge has no direction.

A **directed graph** (often called a digraph) represents asymmetric relationships, like dependencies or data flow. If `API` calls `Auth` to verify a user, `API` depends on `Auth`. `Auth` does not depend on `API`. We draw directed edges with an arrow:

```text
  [ API ]
     |
     v
  [ Auth ]
```

Our custom engine is designed **exclusively for directed graphs**. When drawing dependency graphs, architectures, or state machines, direction matters immensely. It tells us the flow of time, logic, or data.

## Adjacency, Predecessors, and Successors

Let's expand our microservice graph:

```text
          [ API ]
          /     \
         v       v
   [ Auth ]    [ Cache ]
         \       /
          v     v
          [ DB ]
```

When two nodes are connected by an edge, they are **adjacent**.

In a directed graph, we have specific terms for the direction of that adjacency:

- A **predecessor** is a node that points _to_ you.
- A **successor** is a node that you point _to_.

Let's look at the `Cache` node:

- Its predecessor is `API` (because `API` → `Cache`).
- Its successor is `DB` (because `Cache` → `DB`).

## In-Degree and Out-Degree

If we count the number of edges coming in and going out of a node, we get its **degree**.

- **In-degree:** The number of edges pointing _to_ the node.
- **Out-degree:** The number of edges pointing _away_ from the node.

Let's calculate the degrees for our graph:

| Node  | In-Degree | Out-Degree | What does it mean?                                                                     |
| ----- | --------- | ---------- | -------------------------------------------------------------------------------------- |
| API   | 0         | 2          | It's a **Source**. It starts the flow. It depends on nothing, but others depend on it. |
| Auth  | 1         | 1          | It's an intermediary.                                                                  |
| Cache | 1         | 1          | It's an intermediary.                                                                  |
| DB    | 2         | 0          | It's a **Sink**. Flow ends here. It depends on others, but nothing depends on it.      |

In graph layout, **Sources** naturally want to live at the very top (or far left) of the drawing, and **Sinks** naturally want to live at the bottom (or far right).

## Paths and Reachability

A **path** is a sequence of nodes where every consecutive pair is connected by a directed edge.

In our graph, can we get from `API` to `DB`? Yes. We have two paths:

1. `API` → `Auth` → `DB`
2. `API` → `Cache` → `DB`

Because there is a path from `API` to `DB`, we say that `DB` is **reachable** from `API`.

## Cycles: The Layout Wrecker

What if our `DB` service needed to call the `API` to report an error? We would add an edge from `DB` back to `API`.

```text
          [ API ] <----------------+
          /     \                  |
         v       v                 |
   [ Auth ]    [ Cache ]           |
         \       /                 |
          v     v                  |
          [ DB ] ------------------+
```

Now we have a **path** that loops back on itself: `API` → `Auth` → `DB` → `API`.

This is called a **cycle**.

Cycles are a nightmare for graph layout. Remember how we said "Sources want to live at the top"? If there is a cycle, _every node in the cycle is reachable from every other node in the cycle_. There is no clear top or bottom anymore. Does `API` go above `DB`, or does `DB` go above `API`?

Handling cycles (by temporarily pretending some edges point the other way) is one of the most important and complex parts of our layout engine. We will dedicate an entire chapter to it later.

## Connected Components

What if our system has a completely separate background worker that talks to a logging service?

```text
          [ API ]                 [ Worker ]
          /     \                     |
         v       v                    v
   [ Auth ]    [ Cache ]          [ Logger ]
         \       /
          v     v
          [ DB ]
```

We now have two separate islands of nodes. There is no path connecting the API cluster to the Worker cluster. These distinct islands are called **weakly connected components**.

Our layout engine needs to identify these components so it can draw them side-by-side rather than tangling them together.

## The Problem of "Graph Layout"

So, we have nodes and edges. But a graph is just a mathematical concept. It has no shape, no coordinates, no pixels. It exists only as a list of relationships:

```javascript
nodes = ["API", "Auth", "Cache", "DB"];
edges = [
  { source: "API", target: "Auth" },
  { source: "API", target: "Cache" },
  { source: "Auth", target: "DB" },
  { source: "Cache", target: "DB" },
];
```

**Graph Layout** is the computational problem of translating that mathematical list into physical $(x, y)$ coordinates on a screen, such that the result is easy for a human to read.

What makes a graph "easy to read"?

1. Nodes don't overlap.
2. Edges cross each other as little as possible.
3. The direction of flow is obvious (e.g., all arrows generally point downward).
4. Edges aren't unnecessarily long or winding.

In the next chapter, we will look at the [Sugiyama Framework](./02-the-sugiyama-framework.md), a 40-year-old algorithm that solves this exact problem, and see how our custom engine builds upon it.

---

[Index](./README.md) | [Next: The Sugiyama Framework →](./02-the-sugiyama-framework.md)
