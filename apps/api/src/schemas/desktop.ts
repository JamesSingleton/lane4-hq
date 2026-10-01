import { z } from "@hono/zod-openapi";

/** Tauri's static update manifest (`latest.json`). */
export const updateManifestSchema = z
  .object({
    version: z.string().openapi({ example: "0.2.0" }),
    notes: z.string().optional(),
    pub_date: z.string().optional(),
    platforms: z.record(
      z.string().openapi({ example: "darwin-aarch64" }),
      z.object({
        signature: z.string(),
        url: z.url(),
      }),
    ),
  })
  .openapi("DesktopUpdateManifest");

export type UpdateManifest = z.infer<typeof updateManifestSchema>;

export const downloadParamsSchema = z.object({
  assetId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      description: "GitHub release asset id from the update manifest",
      param: { name: "assetId", in: "path" },
    }),
});
