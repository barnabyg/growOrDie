# Local development server

Run `npm run play` (or `run.bat` on Windows) to install dependencies when `node_modules` is missing or
older than `package-lock.json`, build, start the server and open the game in the
default browser (`--no-open` or `NO_OPEN=1` skips the browser). It stops at the
first failing step with a non-zero exit code and reports a busy port in one line.
Alternatively run `npm run build`, then `npm start`, and open http://127.0.0.1:8000.
The server binds only IPv4 loopback; LAN serving is intentionally unsupported.
Set `PORT` to change the port (`0` selects a free port, printed at startup).

This server serves only `index.html` and flat JavaScript modules in `dist/`.
Repository metadata, sources, dependencies, source maps, and arbitrary files are
not public assets. It is a local development convenience, not a production host.
Deploy `index.html` and compiled `dist/*.js` assets to a static host for publishing.

Run `npm run build` before the focused server checks:
`npm test -- tests/server.test.js`. `npm test -- tests/play.test.js` covers the
run script.
