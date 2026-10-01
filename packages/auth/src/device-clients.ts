type DeviceClient = {
  name: string;
  /** Opened after approval so the app comes forward; carries no secrets. */
  returnUrl: string | null;
};

/** Apps allowed to sign in with a device code, by OAuth `client_id`. */
export const DEVICE_CLIENTS = {
  "lane4-desktop": {
    name: "Lane4 Meet Manager",
    returnUrl: "lane4://sign-in/approved",
  },
} as const satisfies Record<string, DeviceClient>;

export type DeviceClientId = keyof typeof DEVICE_CLIENTS;

export function isDeviceClient(clientId: string): clientId is DeviceClientId {
  return Object.hasOwn(DEVICE_CLIENTS, clientId);
}

export function deviceClient(
  clientId: string | null | undefined,
): DeviceClient {
  return clientId && isDeviceClient(clientId)
    ? DEVICE_CLIENTS[clientId]
    : { name: "An app", returnUrl: null };
}

export function deviceClientName(clientId: string | null | undefined): string {
  return deviceClient(clientId).name;
}
