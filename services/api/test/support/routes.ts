import type { INestApplication } from '@nestjs/common';

/** One HTTP route the running app answers, e.g. `{ method: 'post', path: '/api/tables/:id' }`. */
export interface AppRoute {
  method: string;
  path: string;
}

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
}

/**
 * Every route registered on the Express router after `app.init()` (TQR-017 route-coverage guard):
 * Nest mounts each controller method as one Express route, global prefix included.
 */
export const listRoutes = (app: INestApplication): AppRoute[] => {
  const express = app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } };
  const routes: AppRoute[] = [];
  for (const layer of express.router.stack) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const [method, on] of Object.entries(layer.route.methods)) {
      if (!on || method === '_all') continue;
      for (const path of paths) routes.push({ method, path });
    }
  }
  return routes;
};

/** `/api/tables/:id` and `/api/tables/:tableId` are the same route: parameter names do not matter. */
export const routeKey = (method: string, path: string): string =>
  `${method.toUpperCase()} ${path.replace(/:[^/]+/g, ':').replace(/\/$/, '')}`;
