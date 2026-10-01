import type { AppEnv } from "@api/rest/types";
import {
  downloadParamsSchema,
  updateManifestSchema,
} from "@api/schemas/desktop";
import { errorResponse, tooManyRequests } from "@api/schemas/errors";
import { errorBody } from "@api/utils/errors";
import { validationHook } from "@api/utils/validation";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

/** Public: the desktop app's updater calls these before anyone signs in. */
const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

app.openapi(
  createRoute({
    method: "get",
    path: "/update",
    summary: "Check for desktop app updates",
    operationId: "checkDesktopUpdate",
    description:
      "The newest `desktop-v*` release in Tauri's updater format. Download URLs point back at this API. `204` means there is nothing to update to.",
    tags: ["Desktop"],
    responses: {
      200: {
        description: "Update manifest in Tauri updater format",
        content: { "application/json": { schema: updateManifestSchema } },
      },
      204: { description: "No release published" },
      502: errorResponse("GitHub didn't return a usable release"),
      ...tooManyRequests,
    },
  }),
  async (c) => {
    const releases = c.get("desktopReleases");
    if (!releases) return c.body(null, 204);
    const url = new URL(c.req.url);
    const protocol =
      c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const downloadBase = `${protocol}://${url.host}/v1/desktop/update/download`;
    try {
      const manifest = await releases.latestManifest(downloadBase);
      if (!manifest) return c.body(null, 204);
      c.header("Cache-Control", "public, max-age=300");
      return c.json(manifest, 200);
    } catch (error) {
      c.get("logger").error("desktop update lookup failed", {
        error,
        requestId: c.get("requestId"),
      });
      return c.json(
        errorBody("update_unavailable", "Update info is unavailable."),
        502,
      );
    }
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/update/download/{assetId}",
    summary: "Download a desktop update",
    operationId: "downloadDesktopUpdate",
    description:
      "Redirects to a short-lived download URL for an asset of the newest desktop release. Other assets are refused.",
    tags: ["Desktop"],
    request: { params: downloadParamsSchema },
    responses: {
      302: { description: "Redirect to the installer" },
      404: errorResponse("Not part of the newest desktop release"),
      502: errorResponse("GitHub didn't return a download"),
      ...tooManyRequests,
    },
  }),
  async (c) => {
    const releases = c.get("desktopReleases");
    const { assetId } = c.req.valid("param");
    let location: string | null = null;
    try {
      location = releases ? await releases.assetDownloadUrl(assetId) : null;
    } catch (error) {
      c.get("logger").error("desktop update download failed", {
        error,
        requestId: c.get("requestId"),
      });
      return c.json(
        errorBody("update_unavailable", "The download is unavailable."),
        502,
      );
    }
    if (!location) {
      return c.json(errorBody("not_found", "No such update."), 404);
    }
    return c.redirect(location, 302);
  },
);

export { app as desktopRouter };
