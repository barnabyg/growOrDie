import { createServer } from "node:http";
import { stripVTControlCharacters } from "node:util";

export function createState(stages, now = Date.now()) {
  return {
    startedAt: now,
    finishedAt: null,
    status: "running",
    activeStage: null,
    stages: stages.map((name) => ({ name, status: "pending" })),
    tests: [],
    output: "",
  };
}

export function recordOutput(state, output) {
  // Strip terminal color controls; retain only bounded recent output in the UI.
  state.output = (state.output + stripVTControlCharacters(output)).slice(
    -24000,
  );
}

export async function runStages(stages, state, execute) {
  for (const [index, stage] of stages.entries()) {
    state.activeStage = stage.name;
    state.stages[index].status = "running";
    let code;
    try {
      code = await execute(stage);
    } catch (error) {
      recordOutput(state, `${error}\n`);
      code = 1;
    }
    state.stages[index].status = code === 0 ? "passed" : "failed";
    if (code !== 0) {
      state.status = "failed";
      state.finishedAt = Date.now();
      return code;
    }
  }
  state.activeStage = null;
  state.status = "passed";
  state.finishedAt = Date.now();
  return 0;
}

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Grow or Die verification</title>
<style>body{background:#14100c;color:#ece3d4;font:16px system-ui;max-width:1000px;margin:30px auto;padding:0 16px}h1{font-size:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#211a13;padding:16px;border-radius:8px}.passed{color:#a7df8c}.failed{color:#ff997c}.running{color:#f1d170}li{margin:6px 0}</style>
<h1>Grow or Die verification</h1><p id="status">Connecting…</p><ol id="stages"></ol><h2>Tests</h2><p id="tests"></p><ul id="failures"></ul><h2>Recent output</h2><pre id="output"></pre>
<script>async function update(){try{const s=await(await fetch('/state')).json();document.getElementById('status').textContent=s.status+' · '+(s.activeStage??'finished')+' · '+Math.round(((s.finishedAt??Date.now())-s.startedAt)/1000)+'s';const list=document.getElementById('stages');list.replaceChildren();for(const stage of s.stages){const item=document.createElement('li');item.textContent=stage.name+' — '+stage.status;item.className=stage.status;list.append(item)}document.getElementById('tests').textContent=s.tests.length+' completed test cases';const failures=document.getElementById('failures');failures.replaceChildren();for(const test of s.tests.filter(t=>['fail','failed','timedOut','interrupted'].includes(t.status))){const item=document.createElement('li');item.textContent=test.name+' — '+test.status;failures.append(item)}document.getElementById('output').textContent=s.output;if(s.finishedAt)clearInterval(timer)}catch{document.getElementById('status').textContent='Dashboard disconnected. Terminal output remains authoritative.'}}const timer=setInterval(update,500);update()</script></html>`;

export async function startDashboard(state, { port = 0 } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (request.url === "/state") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(state));
    } else if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(PAGE);
    } else response.writeHead(404).end();
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

export async function optionalDashboard(state, start = startDashboard) {
  try {
    return await start(state);
  } catch {
    console.log(
      "Dashboard unavailable; verification continues in the terminal.",
    );
    return null;
  }
}
