/** The always-on public tracker, as an independent entry point separate
 * from the `piecework` CLI - this is the process a hosting platform runs
 * directly, listening on whatever port it's told to (most PaaS platforms
 * inject $PORT) and on every interface, since the whole point of it is to
 * be reachable from other people's machines. */
import { Tracker } from "./tracker.js";

const port = Number(process.env.PORT) || 6969;

const tracker = new Tracker();
tracker.listen(port, "0.0.0.0").then((actualPort) => {
  console.log(`Piecework public tracker listening on 0.0.0.0:${actualPort}`);
});
