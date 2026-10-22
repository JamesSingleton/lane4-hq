import { headers } from "next/headers";
import { cache } from "react";
import { staffAuth } from "./staff-server";

export const getStaffSession = cache(async () => {
  return staffAuth.api.getSession({
    headers: await headers(),
  });
});
