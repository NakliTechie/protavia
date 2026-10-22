// Talking to the compute bridge, when there is one.
//
// The bridge is a local server that serves this page as well as its own routes, so everything here
// is a same-origin request to `/bridge/...`. That is not a convenience: a page on
// https://protavia.naklitechie.com cannot fetch http://127.0.0.1 at all, because an https page may
// not fetch http. Sharing an origin removes the problem. See docs/bridge-contract.md.
//
// Most people will never have a bridge. The hosted site has none, and the app is useful without
// one, so nothing here may make the page worse when the answer is no: the check is one request
// that fails fast, and a failure is an ordinary state rather than an error.

/** How long to wait before deciding there is no bridge. It is a loopback call or nothing. */
const TIMEOUT_MS = 1500;

let state = null;

/**
 * Look for a bridge on this origin.
 *
 * @returns {Promise<{present: boolean, host?: object, engines?: Array<object>, why?: string}>}
 */
export async function detect() {
  if (state) return state;

  // A page served from anywhere but a local address has no bridge by construction, so there is no
  // reason to make the request at all. Saying so is better than a failed fetch in the console.
  if (!isLocal()) {
    state = {
      present: false,
      why: 'This is the hosted site, which has no compute host. Run the bridge on your own '
        + 'machine to design binders: see docs/bridge-contract.md.',
    };
    return state;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch('/bridge/health', { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`the bridge answered ${response.status}`);
    const body = await response.json();
    if (body.bridge !== 'protavia') throw new Error('something else is serving this page');

    state = { present: true, ...body };
  } catch (e) {
    state = {
      present: false,
      why: e.name === 'AbortError'
        ? 'A bridge did not answer in time on this origin.'
        : `No bridge on this origin: ${e.message}.`,
    };
  }
  return state;
}

/** Served from a loopback address, which is the only place a bridge can be. */
function isLocal() {
  const h = location.hostname;
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
}

/** What the last detect found, without asking again. */
export function current() {
  return state;
}

/** Forget what we found, so the next detect asks again. */
export function forget() {
  state = null;
}

/**
 * One line naming the machine a run would happen on. The licence Protavia relies on turns on the
 * person running the engine themselves, and the project's own rule is that they never have to
 * guess whose machine their work is on, so this is shown wherever a run can be started.
 */
export function hostLine(found = state) {
  if (!found || !found.present) return null;
  const { name, platform, machine, cpus } = found.host;
  return `${name} · ${platform} ${machine}, ${cpus} cores`;
}

/** The engines this machine could actually run, best first. */
export function usableEngines(found = state) {
  if (!found || !found.present) return [];
  return found.engines
    .filter((e) => e.runsHere)
    .sort((a, b) => Number(b.installed) - Number(a.installed));
}
