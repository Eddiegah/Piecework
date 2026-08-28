import { networkInterfaces } from "node:os";

/** Best-effort guess at this machine's LAN IP (the address other devices
 * on the same WiFi/router would use to reach it) - purely for friendlier
 * CLI messaging, never used for the actual protocol logic. Falls back to
 * null if nothing suitable is found (e.g. no network at all). */
export function getLanAddress(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}
