import { spawn } from "node:child_process";

export function runNode(args, { env = process.env, onOutput = () => {} } = {}) {
  // Playwright sets FORCE_COLOR for its workers. Translate NO_COLOR first so
  // inherited preferences do not produce Node's conflicting-color warning.
  const childEnv = { ...env };
  if (childEnv.NO_COLOR !== undefined) {
    childEnv.FORCE_COLOR ??= "0";
    delete childEnv.NO_COLOR;
  }
  return new Promise((accept) => {
    const child = spawn(process.execPath, args, {
      env: childEnv,
      windowsHide: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    for (const [stream, target] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on("data", (chunk) => {
        target.write(chunk);
        try {
          onOutput(String(chunk));
        } catch {
          // Observational reporting must never interrupt the command.
        }
      });
    }
    child.once("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      accept(1);
    });
    child.once("close", (code) => accept(code ?? 1));
  });
}
