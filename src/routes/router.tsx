import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AppContent } from "../AppContent";
import { GraphTestingPage } from "../features/GraphTesting/components/GraphTestingPage";
import { fetchManifest } from "../api/graphFilesApi";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const files = await fetchManifest();
    throw redirect({ to: "/graphs/$fileId", params: { fileId: files[0] ?? "welcome" } });
  },
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graphs/$fileId",
  beforeLoad: ({ params }) => {
    if (params.fileId.endsWith(".json")) {
      throw redirect({
        to: "/graphs/$fileId",
        params: { fileId: params.fileId.replace(/\.json$/, "") },
      });
    }
  },
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
