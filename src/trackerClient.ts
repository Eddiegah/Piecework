import { bdecode } from "./bencode.js";
import { AnnounceRequest, AnnouncedPeer, buildAnnounceUrl } from "./tracker.js";

/** The peer side of an announce round-trip: asks the tracker who else is
 * in this swarm, over plain HTTP, and parses the bencoded peer list back
 * out. */
export async function announce(trackerUrl: string, req: AnnounceRequest): Promise<AnnouncedPeer[]> {
  const url = buildAnnounceUrl(trackerUrl, req);
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const decoded = bdecode(body);

  if (typeof decoded !== "object" || Buffer.isBuffer(decoded) || Array.isArray(decoded)) {
    throw new Error("tracker response was not a dictionary");
  }
  if ("failure reason" in decoded) {
    const reason = decoded["failure reason"];
    throw new Error(`tracker refused announce: ${Buffer.isBuffer(reason) ? reason.toString("utf8") : reason}`);
  }

  const peersRaw = decoded.peers;
  if (!Array.isArray(peersRaw)) throw new Error("tracker response missing 'peers' list");

  return peersRaw.map((entry): AnnouncedPeer => {
    if (typeof entry !== "object" || Buffer.isBuffer(entry) || Array.isArray(entry)) {
      throw new Error("invalid peer entry in tracker response");
    }
    const peerId = entry["peer id"];
    const ip = entry.ip;
    const port = entry.port;
    if (!Buffer.isBuffer(peerId) || !Buffer.isBuffer(ip) || typeof port !== "number") {
      throw new Error("invalid peer entry fields in tracker response");
    }
    return { peerId, ip: ip.toString("utf8"), port };
  });
}
