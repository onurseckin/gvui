import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AppContent } from "../AppContent";
import { GraphTestingPage } from "../features/GraphTesting/components/GraphTestingPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/graphs/$fileId", params: { fileId: "ai_agent_trace.json" } });
  },
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graphs/$fileId",
  component: AppContent,
});

const testingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/testing",
  component: GraphTestingPage,
});

const routeTree = rootRoute.addChildren([indexRoute, graphRoute, testingRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
