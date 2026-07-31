# ADR-002: Grid A* Orthogonal Routing with 90° Turn Penalties

## Status
Accepted

## Date
2026-07-31

## Context
Standard straight-line or Bezier edge paths in dense directed graphs cause severe edge-edge visual overlap and obscure node labels. Orthogonal polyline routing is required for clean circuit-like diagrams.

## Decision
Use a 2D spatial grid A* pathfinding algorithm (`src/engine/layout/custom/routeSearch.ts`) with:
1. **Turn Penalties ($P_{\text{bend}} = 40$)**: Added to path cost $g(p)$ whenever vector direction changes by 90°.
2. **Obstacle Clearance ($P_{\text{obstacle}} = 500$)**: Penalizes paths entering node envelopes.
3. **SVG Perpendicular Crossing Bridges**: Generates `A 6 6 0 0 0` arc commands in `svgPath.ts` when horizontal and vertical edges intersect.

## Consequences
- Edge paths present clean, predictable 90° bends.
- Non-planar graph edge intersections are easily readable via visual bridges.
