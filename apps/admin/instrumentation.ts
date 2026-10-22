import { reportServerException } from "@/app/analytics";

export async function onRequestError(
  error: unknown,
  request: { path: string },
): Promise<void> {
  await reportServerException(error, request.path);
}
