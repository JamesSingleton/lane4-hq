import { withAuth } from "./auth";
import { withClientIp } from "./ip";
import { rateLimit } from "./rate-limit";

/** Every `/v1` route: who's calling, and a per-IP ceiling before any auth or
 * database work. */
export const publicMiddleware = [withClientIp, rateLimit("ip")];

/** Routes mounted after this need a signed-in user. Each route then adds its
 * own per-user rule (`rateLimit("user")`, or a looser one for bursts). */
export const protectedMiddleware = [withAuth];

export { rateLimit } from "./rate-limit";
