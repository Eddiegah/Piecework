# Piecework

**Share a file with anyone in one command — no account, no upload, no app.** Real peer-to-peer
transfer, implemented from scratch: not a simulation of BitTorrent's idea, the actual wire
protocol - real bencoding, real SHA-1 piece verification, a real tracker, and the real peer
handshake and message format (BEP 3), talking over genuine TCP sockets between independent
machines.

[![CI](https://github.com/Eddiegah/Piecework/actions/workflows/ci.yml/badge.svg)](https://github.com/Eddiegah/Piecework/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/piecework?color=cb3837&logo=npm)](https://www.npmjs.com/package/piecework)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Zero torrent deps](https://img.shields.io/badge/torrent%20libraries%20used-zero-blue)](package.json)
[![Cost to run](https://img.shields.io/badge/cost%20to%20run-%240-brightgreen)](#try-it-in-30-seconds)

## Try it in 30 seconds

No install, no clone, no build - `npx` fetches it fresh from npm and runs it:

**You (sending a file):**
```bash
npx piecework send ./photo.jpg
```
```
Share this code:  swift-otter-42

They run:  npx piecework get swift-otter-42

Sending "photo.jpg" (2,341,884 bytes) from 192.168.1.42:51774
Keep this running until they've finished downloading.
```

**Them (anywhere - same WiFi, or across the internet with a forwarded port):**
```bash
npx piecework get swift-otter-42
```
```
Found "photo.jpg" (2,341,884 bytes, 143 pieces)
Connecting to peers and downloading...
143/143 pieces
Saved photo.jpg
```

That's the whole product experience. If you've never opened a terminal before, the next section
walks through every step with nothing assumed. If you're already comfortable with a command
line, skip straight to [Contents](#contents) - everything below that is what's actually
happening underneath it, and the proof that it's real.

## Never used a terminal before? Start here.

You don't need to know how to code to use this. It takes about 5 minutes the first time (mostly
installing one free program) and about 10 seconds every time after that. No account, no sign-up,
nothing to pay.

**What a "terminal" is**, if that word is new: it's a plain window where you type a line of text
and press Enter instead of clicking buttons. Every computer already has one built in - you're
not installing anything unusual by opening it.

### Step 1 - Install Node.js (one time only)

Piecework runs on a free tool called Node.js. If a friend already had you install it for
something else, skip to Step 2.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the big download button (it recommends the "LTS" version - that's the right one)
3. Open the downloaded file and click through the installer - the default options are fine,
   just keep clicking "Next" / "Install"

That's the only installation step, and you won't need to repeat it.

### Step 2 - Open a terminal

- **Windows**: press the Windows key, type `PowerShell`, press Enter
- **Mac**: press `Cmd + Space`, type `Terminal`, press Enter
- **Linux**: you likely already know this - `Ctrl + Alt + T` usually works

A window with a blinking cursor opens. That's it, that's the terminal.

### Step 3 - Send a file

Type `npx piecework send `, leave a space after it, then **drag the file itself** from a folder
window straight into the terminal - that automatically fills in the correct path so you don't
have to type it by hand. It'll look something like this:

```bash
npx piecework send "C:\Users\YourName\Desktop\photo.jpg"
```

Press Enter. The very first time, it takes a few extra seconds to fetch the tool - that's
normal and only happens once. Then you'll see something like:

```
Share this code:  swift-otter-42
```

That three-word-and-two-number code is what you send to your friend - text it, WhatsApp it,
say it out loud, however you'd normally reach them.

**Leave this window open.** Your file is being sent directly from your computer to theirs, with
nothing in between - so this window has to stay open (minimizing is fine) until they've finished
downloading. Closing it is like hanging up the phone mid-sentence.

### Step 4 - Receive a file

Your friend opens their own terminal (Step 2, on their computer) and types:

```bash
npx piecework get swift-otter-42
```

using the actual code you sent them. A few seconds later, the file shows up in the folder the
terminal opened in - usually their user folder (things like `C:\Users\TheirName` on Windows, or
their home folder on Mac/Linux).

### Common questions

**"npx: command not found" or "npx is not recognized"**
Node.js isn't installed yet, or the terminal was already open when you installed it. Go back to
Step 1, then close and reopen the terminal.

**The receiving side just sits there and nothing happens**
This works instantly when both people are on the same WiFi. Sending across the internet to
someone on a *different* network (a different house, a different city) usually needs the
sender's router configured to allow the connection through - that's just how direct,
server-free file transfer works, not something broken on your end. If that's not practical, the
easiest fix is using it while you're actually on the same WiFi (e.g. sharing something with
someone sitting next to you).

**Is this safe? Can anyone else see my file?**
No one except the person you give the code to can get your file. It travels directly from your
computer to theirs - never through a server, never stored anywhere. The only thing that ever
touches a server is the short code itself, which is just used to help your friend's computer
find yours; your actual file content is never uploaded anywhere.

**Do I need to create an account, or will this cost me anything?**
No account, ever. Completely free, for any size file.

**Something else went wrong**
Open an issue at [github.com/Eddiegah/Piecework/issues](https://github.com/Eddiegah/Piecework/issues)
with what you typed and what happened - happy to help.

## Contents

- [Never used a terminal before? Start here.](#never-used-a-terminal-before-start-here)
- [Why this exists](#why-this-exists)
- [The proof: a real swarm, not a description of one](#the-proof-a-real-swarm-not-a-description-of-one)
- [The public tracker](#the-public-tracker)
- [Running it yourself, without the public tracker](#running-it-yourself-without-the-public-tracker)
- [Architecture](#architecture)
- [How a transfer actually happens](#how-a-transfer-actually-happens)
- [Proof this is correct, not just pretty](#proof-this-is-correct-not-just-pretty)
- [Command reference](#command-reference)
- [Explicitly simplified for v1](#explicitly-simplified-for-v1)
- [License](#license)

---

*Everything from here down is the technical write-up - how it works, why it's real, and how it's
tested. Nothing further to read if you just wanted to send a file.*

## Why this exists

"I understand networking" is one of the most commonly *claimed* and rarely *actually
demonstrated* skills in a portfolio. Piecework is the demonstration: every piece of the actual
BitTorrent protocol that makes a swarm work - not a toy approximation of it - built from the
ground up in TypeScript with no third-party torrent library anywhere in the dependency tree.
`commander` (CLI argument parsing) is the only runtime dependency; the protocol itself -
bencoding, hashing, the tracker, the wire format, the swarm logic - is all original code. The
`send`/`get` short-code flow on top of it is a genuine attempt at a *product*, not just a demo:
something you can actually hand to a non-technical friend and have it work.

## The proof: a real swarm, not a description of one

`npm run demo` starts a real HTTP tracker and four independent peer nodes - one seeder holding
a complete file, three leechers starting from zero - lets them discover each other and trade
pieces over genuine TCP sockets, then verifies every leecher reassembled the file byte-for-byte
identical to the original, having only ever received it in independently hash-checked pieces
from whichever peer happened to have them (seeder *or* a fellow leecher). This exact run is also
wired into [CI](https://github.com/Eddiegah/Piecework/actions/workflows/ci.yml), so it re-proves
itself on every push, on a machine that's never seen this code before - not just once in a
README. Actual captured output below (the test file is fresh random bytes each run, so the hash
will differ if you run it yourself - that's expected, not a typo):

```
Piecework demo — a real multi-peer file transfer over the actual BitTorrent wire protocol

Test file:  200,000 random bytes, sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983
Tracker:    listening on 127.0.0.1:64503
Manifest:   13 pieces, up to 16,384 bytes each

Seeder online   (127.0.0.1:9001) — starts at 100%
Leecher 1 online  (127.0.0.1:9002) — starts at 0%
Leecher 2 online  (127.0.0.1:9003) — starts at 0%
Leecher 3 online  (127.0.0.1:9004) — starts at 0%

Trading pieces...

  13/13 seeder   leecher 1: 2/13   leecher 2: 3/13   leecher 3: 4/13
  13/13 seeder   leecher 1: 9/13   leecher 2: 9/13   leecher 3: 9/13
  13/13 seeder   leecher 1: 13/13   leecher 2: 13/13   leecher 3: 13/13

All leechers report complete. Verifying byte-for-byte against the original...

  leecher 1: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅
  leecher 2: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅
  leecher 3: sha1 ec369fd6413ce6d55a9612661661d85d8f1c9983  MATCHES original ✅

PASS — every leecher reassembled the exact original file, byte for byte, using only pieces
traded peer-to-peer.
```

Notice the middle progress line: leechers 1/2/3 sit at uneven 2/3/4 pieces, not identical counts
in lockstep - that unevenness is what real peer-to-peer looks like (peers trading with whichever
neighbor answers first) as opposed to three clients all just downloading from one server at the
same speed.

## The public tracker

`send`/`get` default to **[piecework.onrender.com](https://piecework.onrender.com)**, a small
tracker I run so two people don't each need to stand one up themselves - it only ever does peer
discovery and stores tiny manifest files (mostly just SHA-1 hashes) under short codes;
**it never sees, stores, or relays any actual file content**, exactly like a real BitTorrent
tracker. Source for it is the same `src/tracker.ts` in this repo (run as the standalone
`src/trackerServer.ts` entry point) - nothing hidden, nothing different from what you can run
yourself.

It's genuinely been end-to-end tested against this exact deployment, not just localhost: a real
`send` on one machine, a real `get` on another process reading the code back from
piecework.onrender.com over the open internet, landing on a byte-for-byte identical SHA-1.

Two things worth knowing:
- **Same WiFi/network: works with zero configuration**, every time.
- **Different networks over the open internet**: the *sender* generally needs their router to
  forward the port `send` prints. That's an inherent limitation of direct peer-to-peer (real
  BitTorrent has the same issue without UPnP/DHT, neither of which this implements) - not
  something the public tracker can paper over, since it only ever does introductions, never
  relays data.
- It's hosted on Render's free tier, which sleeps after ~15 minutes idle - the very first
  `send`/`get` after a quiet period can take 30-50 seconds to respond while it wakes up; after
  that it's instant.

## Running it yourself, without the public tracker

```bash
# terminal 1 - run your own tracker
npx piecework tracker --port 6969

# terminal 2 - create a manifest for a real file, then seed it
npx piecework create ./photo.jpg --tracker http://127.0.0.1:6969
npx piecework seed ./photo.jpg ./photo.jpg.piecework

# terminal 3 - download it from the swarm, verifying every piece as it arrives
npx piecework leech ./photo.jpg.piecework ./downloaded.jpg

# then check they're identical
diff ./photo.jpg ./downloaded.jpg && echo "byte-for-byte identical"
```

Or clone the repo directly to run the test suite and the live demo with no network dependency at
all:

```bash
git clone https://github.com/Eddiegah/Piecework.git
cd Piecework
npm install
npm test          # 75 tests, no network needed
npm run demo       # the real thing: a live 4-peer swarm, verified end to end
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
                        trackers need for info_hash/peer_id, which usually aren't valid UTF-8.
                        Also runs the small manifest-by-code store the send/get flow uses.
  trackerClient.ts        the peer side of an announce round-trip, plus store/fetch-by-code
  shareCode.ts            short memorable codes ("swift-otter-42") for the send/get flow
  network.ts              best-effort LAN IP detection, purely for friendlier CLI messages
  swarm.ts                ties it together: a PeerNode listens for incoming peers (on an
                        auto-assigned port and every network interface by default), connects
                        to peers the tracker returns, requests missing pieces, verifies every
                        received piece's hash before accepting it, and serves pieces it has to
                        anyone who asks
  cli.ts                  the command-line tool: send / get / tracker / create / seed / leech
  trackerServer.ts         the standalone entry point the public tracker actually runs
scripts/demo.ts            the end-to-end proof shown above
```

## How a transfer actually happens

```
   PEER A (has the file)                          PEER B (wants the file)
        |                                                  |
        |  1. both announce to the tracker, by info_hash   |
        |------------------->  TRACKER  <-------------------|
        |            (bencoded peer list back)               |
        |                                                  |
        |  2. B opens a TCP connection to A                |
        |<----------------- handshake -------------------->|
        |     (pstr "BitTorrent protocol" + info_hash       |
        |      + peer_id, both directions)                 |
        |                                                  |
        |------------------ bitfield ---------------------->|  "here's what I have"
        |<----------------- bitfield ------------------------|  "here's what I have"
        |                                                  |
        |<----------------- interested -----------------------|
        |------------------- unchoke ----------------------->|
        |                                                  |
        |<------------------ request(i) -----------------------|  "send me piece i"
        |-------------------- piece(i) ---------------------->|  the actual bytes
        |                                                  |
        |                                    B computes SHA-1(piece i)
        |                                    and checks it against the
        |                                    manifest's recorded hash
        |                                    for that index. Mismatch?
        |                                    Discard it, ask someone else.
        |                                                  |
        |<-------------------- have(i) ----------------------->|  B tells everyone it now has piece i
```

The same loop runs between every pair of connected peers simultaneously - which is exactly how
leecher-to-leecher trading happens in the demo above, with no seeder involved for that specific
exchange.

## Proof this is correct, not just pretty

75 unit/integration tests, plus the live swarm demo above - and one of those tests *is* a live
swarm transfer too, run directly inside `npm test` (not just the standalone demo), so the core
claim is checked on every single test run, not only when someone remembers to run the demo
separately. The interesting tests aren't "does it run" - they're checks that would catch the
exact bugs that would break interoperability or integrity silently:

- **Bencode**: round-trips the canonical examples from the original spec exactly, encodes
  dictionary keys in sorted order (required by spec, not optional), round-trips arbitrary binary
  byte strings (not just text), and rejects truncated or trailing-garbage input.
- **info_hash determinism**: identical file content and piece length always produce the
  identical info_hash - and, matching real BitTorrent, the *tracker URL does not* affect it,
  which is what lets two independently-created manifests for the same file interoperate.
- **Hash verification**: a piece corrupted by even a single flipped bit is rejected, not just
  "usually" - checked directly against `verifyPiece`, which is the same function the live swarm
  calls on every piece it ever receives from any peer. A `PeerNode` constructed with seed data
  that doesn't actually match its own manifest is checked to refuse to start at all.
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
- **Manifest-by-code store**: a fetch for a code that was never stored, or one shaped like a path
  traversal / injection attempt (`../../../etc/passwd`), is checked to be rejected rather than
  ever touching the filesystem or another swarm's data.
- **Full 3-peer convergence**: one seeder and two leechers are checked to all end up with the
  identical file, run as an actual assertion, not just watched in a terminal.

## Command reference

| Command | Description | Options |
|---|---|---|
| `piecework send <file>` | Shares a file, prints a short code | `--tracker <url>` (default: the public tracker) |
| `piecework get <code> [output]` | Downloads a file by its code | `--tracker <url>` (default: the public tracker) |
| `piecework tracker` | Runs an HTTP tracker peers announce to | `-p, --port <port>` (default `6969`), `--host <host>` (default `0.0.0.0`) |
| `piecework create <file>` | Builds a `<file>.piecework` manifest | `--tracker <url>` (default `http://127.0.0.1:6969`), `--piece-length <bytes>` (default `16384`) |
| `piecework seed <file> <manifest>` | Serves a complete file into its swarm | `-p, --port <port>` (default: automatic) |
| `piecework leech <manifest> <output>` | Downloads a file from its swarm, verifying every piece | `-p, --port <port>` (default: automatic) |

## Explicitly simplified for v1

- **Whole-piece requests, not 16 KB block pipelining.** Real BitTorrent clients request each
  piece in several smaller blocks and pipeline multiple requests at once for throughput; this
  requests a full piece per message. Correct and fully interoperable with itself, just not
  tuned for large-scale transfer speed.
- **No rarest-first piece selection or choking algorithm.** Every peer unchokes everyone and
  serves any valid request; piece selection is simplest-missing-first rather than
  rarest-first-across-the-swarm. The protocol and integrity guarantees are real; the scheduling
  policy is deliberately the simple version.
- **No DHT / NAT traversal / magnet links.** Peer discovery goes through the tracker (public or
  self-hosted); there's no UPnP/hole-punching, so a sender behind a strict NAT needs a forwarded
  port for peers outside their own network to reach them directly. Matches BitTorrent's original
  (pre-DHT) design.

## License

[MIT](LICENSE) © Edmund Eric Gah
