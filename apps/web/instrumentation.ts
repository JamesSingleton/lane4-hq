import { reportServerException } from "@/lib/analytics";

export async function onRequestError(
  error: unknown,
  request: { path: string },
): Promise<void> {
  await reportServerException("web", error, request.path);
}
