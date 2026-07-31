← Previous | [Index](../README.md) | Next →

# Simple Layouts in GVUI

Welcome to the Simple Layouts engine for GVUI. If you are exploring the codebase and looking for advanced crossing-minimization or topological ordering algorithms, you will not find them here! 

Instead, this module answers a very basic question: **How can we put nodes on a screen as fast as possible so the user can see them?**

## Why Do Simple Layouts Exist?

Graph visualization often deals with datasets where the user just wants to see all the entities at a glance, without worrying about how they connect sequentially. When you load a dataset with 500 nodes, running a complex hierarchical algorithm might take a noticeable amount of time (and often results in a massive, unreadable tree anyway).

Simple layouts ignore graph topology completely. They don't look at edges when deciding where to place nodes. They only look at the number of nodes `N` and arrange them in geometric patterns. 

**What happens if we ignore topology?**
- Edges might cross each other frequently.
- Connected nodes might end up far apart.
- But the layout computes in `O(N)` time—meaning it is instantaneous, even for huge graphs.

## Layout Engine Comparison

| Approach | Speed | Quality (Readability) | When to Use |
| :--- | :--- | :--- | :--- |
| **Grid Layout** (Organic Force) | **O(N)** - Instant | Low - Crossings are ignored | You want to scan all nodes quickly; connections are secondary. |
| **Circular Layout** (Radial Balance) | **O(N)** - Instant | Medium - Creates a hub-and-spoke | Star topologies or when you want all nodes equidistant from the center. |
| **Custom Engine** | Varies | High | Specialized arrangements tailored to specific domain logic. |
| **Dagre (Hierarchical)** | Slower | Very High | Directed acyclic graphs where flow and sequence matter. |

## Table of Contents

1. [Grid Layout](./01-grid-layout.md) (Currently labeled as "Organic Force")
2. [Circular Layout](./02-circular-layout.md) (Currently labeled as "Radial Balance")
