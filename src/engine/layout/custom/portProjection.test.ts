import { describe, expect, it } from "bun:test";
import { projectRemoteToSideOffset } from "./portProjection";
import type { NormalizedNode, Point } from "./types";

describe("portProjection", () => {
  const epsilon = 1e-6;

  it("projects remote centers on all 4 sides with correct offset order", () => {
    const node: NormalizedNode & Point = {
      id: "node",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    // Center is (150, 150)

    // Right side: remote centers below to the right at same Y=300
    const rightR1: Point = { x: 250, y: 300 }; // closer
    const rightR2: Point = { x: 450, y: 300 }; // further right
    const projRight1 = projectRemoteToSideOffset(node, "right", rightR1, epsilon);
    const projRight2 = projectRemoteToSideOffset(node, "right", rightR2, epsilon);
    expect(projRight2).toBeLessThan(projRight1);

    // Left side: remote centers below to the left at same Y=300
    const leftR1: Point = { x: 50, y: 300 }; // closer
    const leftR2: Point = { x: -150, y: 300 }; // further left
    const projLeft1 = projectRemoteToSideOffset(node, "left", leftR1, epsilon);
    const projLeft2 = projectRemoteToSideOffset(node, "left", leftR2, epsilon);
    expect(projLeft2).toBeLessThan(projLeft1);

    // Top side: remote centers to the right and above at same X=300
    const topR1: Point = { x: 300, y: 50 }; // closer
    const topR2: Point = { x: 300, y: -150 }; // further up
    const projTop1 = projectRemoteToSideOffset(node, "top", topR1, epsilon);
    const projTop2 = projectRemoteToSideOffset(node, "top", topR2, epsilon);
    expect(projTop2).toBeLessThan(projTop1);

    // Bottom side: remote centers to the right and below at same X=300
    const bottomR1: Point = { x: 300, y: 250 }; // closer
    const bottomR2: Point = { x: 300, y: 450 }; // further down
    const projBottom1 = projectRemoteToSideOffset(node, "bottom", bottomR1, epsilon);
    const projBottom2 = projectRemoteToSideOffset(node, "bottom", bottomR2, epsilon);
    expect(projBottom2).toBeLessThan(projBottom1);
  });

  it("reproduces messages 5-7 Dispatcher right boundary projection order", () => {
    const dispatcher: NormalizedNode & Point = {
      id: "Dispatcher",
      x: 588,
      y: 67.5,
      width: 160,
      height: 90,
    };
    // Dispatcher center: (668, 112.5), right boundary x = 748

    const W5: Point = { x: 844, y: 292.5 };
    const W6: Point = { x: 1020, y: 292.5 };
    const W7: Point = { x: 1196, y: 292.5 };

    const projectedW5 = projectRemoteToSideOffset(dispatcher, "right", W5, epsilon);
    const projectedW6 = projectRemoteToSideOffset(dispatcher, "right", W6, epsilon);
    const projectedW7 = projectRemoteToSideOffset(dispatcher, "right", W7, epsilon);

    expect(projectedW7).toBeLessThan(projectedW6);
    expect(projectedW6).toBeLessThan(projectedW5);
  });
});
