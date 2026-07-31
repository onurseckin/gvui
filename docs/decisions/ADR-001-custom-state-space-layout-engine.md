# ADR-001: Custom State-Space Layout Engine for Complex Directed Graphs

## Status
Accepted

## Date
2026-07-31

## Context
GVUI requires a graph visualization system capable of rendering complex microservice topologies, trace logs, and directed acyclic/cyclic graphs with dense edge labels ("badges"). 

Existing off-the-shelf layout engines (e.g., pure Dagre or Graphviz) suffer from several critical limitations in modern UI applications:
1. Fixed rectangular node assumptions that do not respect dynamic DOM card dimensions.
2. Rigid edge routing that places edge badges directly over adjacent nodes or intersecting edges when cycle back-edges exist.
3. Lack of fine-grained control over orthogonal turn penalties and perpendicular crossing bridge rendering.
4. Synchronous execution models that freeze the browser main thread during large graph optimizations.

## Decision
We implemented a custom **Multi-Pass State-Space Layout Engine** (`src/engine/layout/custom/`) operating in a dedicated Web Worker client (`customLayoutWorkerClient.ts`). 

Key architectural components include:
1. **Lexicographic Fitness Cost Evaluation**: Multi-objective cost vector $\mathbf{C}(\sigma) = \langle C_{\text{hard}}, C_{\text{cross}}, C_{\text{bends}}, C_{\text{length}}, C_{\text{badges}} \rangle$ prioritizing hard overlap elimination before crossing minimization.
2. **Grid A* Orthogonal Edge Pathfinder**: Custom A* routing with 90° turn penalties ($P_{\text{bend}} = 40$) and perpendicular SVG arc bridges ($r = 6\text{px}$).
3. **Dynamic Node Spacing Demands**: Feedback loop where badge placement collisions emit same-rank gap expansion demands ($G_{\text{req}}$), triggering coordinate re-calculation to eliminate badge-node overlaps.
4. **Async Time-Sliced Worker Execution**: 32-stage streaming progress engine yielding event loop control to keep the UI interactive.

## Alternatives Considered

### Pure DagreJS (`dagre`)
- **Pros**: Fast, standard Sugiyama implementation.
- **Cons**: Severe edge badge collision issues on cyclic back-edges and same-rank horizontal edges.
- **Rejected**: Retained only as alternative secondary layout modes (`top-down-dagre`, `left-right`).

### D3 Force-Directed Layout (`d3-force`)
- **Pros**: Organic clustering for unstructured graphs.
- **Cons**: Lacks structured rank hierarchy and deterministic orthogonal edge routing.
- **Rejected**: Retained as an optional secondary mode (`force`).

## Consequences
- **Positive**: 0 badge-node overlaps on complex cyclic graphs (e.g. `cyclic_mesh.json`); deterministic orthogonal edge paths; non-blocking Web Worker UI.
- **Negative**: Increased codebase surface area under `src/engine/layout/custom/` requiring comprehensive unit tests and Diátaxis documentation.
