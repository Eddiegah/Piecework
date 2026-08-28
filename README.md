# Piecework

**A real peer-to-peer file-sharing protocol, implemented from scratch.** Not a simulation of
BitTorrent's idea - the actual wire protocol: real bencoding, real SHA-1 piece verification, a
real tracker, and the real peer handshake and message format (BEP 3), talking over genuine TCP
sockets between independent processes.

[![CI](https://github.com/Eddiegah/Piecework/actions/workflows/ci.yml/badge.svg)](https://github.com/Eddiegah/Piecework/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](package.json)
[![Cost to run](https://img.shields.io/badge/cost%20to%20run-%240-brightgreen)](#quick-start)

## Why this exists

"I understand networking" is one of the most commonly *claimed* and rarely *actually
demonstrated* skills in a portfolio. Piecework is the demonstration: every piece of the actual
BitTorrent protocol that makes a swarm work - not a toy approximation of it - built from the
ground up in TypeScript with no third-party torrent library anywhere in the dependency tree.

## The proof: a real swarm, not a description of one

`npm run demo` starts a real HTTP tracker and four independent peer nodes - one seeder holding
a complete file, three leechers starting from zero - lets them discover each other and trade
pieces over genuine TCP sockets, then verifies every leecher reassembled the file byte-for-byte
identical to the original, having only ever received it in independently hash-checked pieces
from whichever peer happened to have them (seeder *or* a fellow leecher). This exact run is
also wired into CI, so it re-proves itself on every push, not just once in a README.

```
Piecework demo — a real multi-peer file transfer over the actual BitTorrent wire protocol

Test file:  200,000 random bytes, sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983
Tracker:    listening on 127.0.0.1:xxxxx
Manifest:   13 pieces, up to 16,384 bytes each

Seeder online   (127.0.0.1:9001) — starts at 100%
Leecher 1 online  (127.0.0.1:9002) — starts at 0%
Leecher 2 online  (127.0.0.1:9003) — starts at 0%
Leecher 3 online  (127.0.0.1:9004) — starts at 0%

Trading pieces...

  13/13 seeder   leecher 1: 13/13   leecher 2: 13/13   leecher 3: 13/13

All leechers report complete. Verifying byte-for-byte against the original...

  leecher 1: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅
  leecher 2: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅
  leecher 3: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅

PASS — every leecher reassembled the exact original file, byte for byte, using only pieces
traded peer-to-peer.
```

It also works as a genuinely separate-process CLI - not just an in-process demo. In three
different terminals:

```bash
piecework tracker --port 6969
piecework seed ./movie.mp4 movie.mp4.piecework --port 9001
piecework leech movie.mp4.piecework ./downloaded.mp4 --port 9002
```

## Architecture

```
src/
  bencode.ts          the actual bencode format .torrent files and tracker responses use:
                        integers, byte strings, lists, dictionaries - four types, hand-rolled
  pieces.ts             SHA-1 piece hashing and verification - the whole trust model in one file
  manifest.ts            builds/parses a .piecework manifest; computes info_hash exactly the way
                        real BitTorrent does (SHA-1 of the bencoded info dict, not a random ID)
  bitfield.ts            bit-packed "which pieces do I have", same layout as the real bitfield
                        wire message
  wireProtocol.ts         BEP 3's peer wire protocol: the handshake, and every message type
                        (choke/unchoke/interested/have/bitfield/request/piece/cancel), with a
                        proper incremental decoder for TCP's byte-stream framing
  peerConnection.ts       wraps a raw TCP socket with that framing - buffers partial reads,
                        emits complete handshakes/messages as they become available
  tracker.ts              a real HTTP tracker: peers announce, get back the current swarm's
                        peer list, bencoded - including the byte-safe percent-encoding real
                        trackers need for info_hash/peer_id, which usually aren't valid UTF-8
  trackerClient.ts        the peer side of an announce round-trip
  swarm.ts                ties it together: a PeerNode listens for incoming peers, connects to
                        peers the tracker returns, requests missing pieces, verifies every
                        received piece's hash before accepting it, and serves pieces it has to
                        anyone who asks
  cli.ts                  a real command-line tool: tracker / create / seed / leech
scripts/demo.ts            the end-to-end proof described above
```

## Proof this is correct, not just pretty

63 unit/integration tests, plus the live swarm demo above. The interesting ones aren't "does it
run" - they're checks that would catch the exact bugs that would break interoperability or
integrity silently:

- **Bencode**: round-trips the canonical examples from the original spec exactly, encodes
  dictionary keys in sorted order (required by spec, not optional), round-trips arbitrary binary
  byte strings (not just text), and rejects truncated or trailing-garbage input.
- **info_hash determinism**: identical file content and piece length always produce the
  identical info_hash - and, matching real BitTorrent, the *tracker URL does not* affect it,
  which is what lets two independently-created manifests for the same file interoperate.
- **Hash verification**: a piece corrupted by even a single flipped bit is rejected, not just
  "usually" - checked directly against `verifyPiece`, which is the same function the live swarm
  calls on every piece it ever receives from any peer.
- **Wire protocol streaming**: messages are checked to decode correctly when split across
  multiple TCP chunks, when several arrive concatenated in one chunk, and to correctly report
  "not enough bytes yet" rather than crash on a partial read - this is what a real socket's
  `data` event actually looks like, not the tidy one-message-per-call case that's easy to get
  wrong in a hurry.
- **Tracker isolation**: two different `info_hash` swarms are checked to never leak peers into
  each other, and info_hash/peer_id byte sequences that aren't valid UTF-8 (the normal case for
  real SHA-1 hashes) are checked to round-trip through the tracker's query string without
  corruption - the exact bug class that shows up if you reach for `URLSearchParams` here instead
  of handling the encoding by hand.

## Quick start

```bash
npm install
npm test          # 63 tests, no network needed
npm run demo       # the real thing: a live 4-peer swarm, verified end to end
```

## Explicitly simplified for v1

- **Whole-piece requests, not 16 KB block pipelining.** Real BitTorrent clients request each
  piece in several smaller blocks and pipeline multiple requests at once for throughput; this
  requests a full piece per message. Correct and fully interoperable with itself, just not
  tuned for large-scale transfer speed.
- **No rarest-first piece selection or choking algorithm.** Every peer unchokes everyone and
  serves any valid request; piece selection is simplest-missing-first rather than
  rarest-first-across-the-swarm. The protocol and integrity guarantees are real; the scheduling
  policy is deliberately the simple version.
- **No DHT / peer exchange / magnet links.** Peer discovery is tracker-only, matching
  BitTorrent's original (pre-DHT) design.

## License

[MIT](LICENSE) © Edmund Eric Gah
