import http from "node:http";
import { loadConfig } from "./config.js";
import { createFirestoreRepository } from "./firestoreWriter.js";
import { DemoGeneratorService } from "./index.js";
import { Scheduler } from "./scheduler.js";

const config = loadConfig();
process.env.TZ = config.timeZone;
let service;
let scheduler;

async function getService() {
  if (!service) service = new DemoGeneratorService(await createFirestoreRepository(), config);
  return service;
}

function getScheduler() {
  if (!scheduler) scheduler = new Scheduler();
  return scheduler;
}

const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" }); res.end(JSON.stringify(data)); };
const text = (res, status, data) => { res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }); res.end(data); };
const startNormalScheduler = (activeService) => getScheduler().start(() => activeService.normalOnce({ continuous: true }), config.normalIntervalMinutes * 60000, () => activeService.heartbeat(), config.heartbeatIntervalSeconds * 1000);

function generationAllowed(path) {
  if (!config.enabled) return false;
  if (path.startsWith("/normal/")) return config.allowNormalGeneration && (path !== "/normal/start" || config.schedulerEnabled);
  if (path.startsWith("/demo/")) return config.demoEnabled && config.allowAcceleratedDemo;
  return true;
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && path === "/health") return json(res, 200, { health: "ok" });
    if (req.method === "GET" && path === "/status") {
      const result = await (await getService()).status();
      return json(res, 200, { ...result, generatorEnabled: config.enabled });
    }
    if (req.method !== "POST") return json(res, 404, { error: "Ruta no encontrada" });
    if (!generationAllowed(path)) return text(res, 403, "Generator disabled");

    const body = await new Promise((resolve, reject) => { let raw = ""; req.on("data", c => raw += c); req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } }); });
    const activeService = await getService();
    const activeScheduler = getScheduler();
    let result;
    if (path === "/normal/start") { startNormalScheduler(activeService); try { result = await activeService.startNormal(); } catch (error) { activeScheduler.stop(); throw error; } }
    else if (path === "/normal/pause") { activeScheduler.stop(); result = await activeService.stopNormal(); }
    else if (path === "/normal/once") { activeScheduler.stop(); result = await activeService.normalOnce(); }
    else if (path === "/demo/start") { activeScheduler.stop(); result = await activeService.startDemo(body); activeScheduler.start(() => activeService.acceleratedOnce(), config.acceleratedIntervalSeconds * 1000); }
    else if (path === "/demo/pause") { activeScheduler.stop(); result = await activeService.pauseDemo(); }
    else if (path === "/demo/step") result = await activeService.acceleratedOnce();
    else if (path === "/demo/restore") { activeScheduler.stop(); result = await activeService.restore(body.reason); }
    else return json(res, 404, { error: "Ruta no encontrada" });
    json(res, 200, result);
  } catch (error) { json(res, 500, { error: error.message }); }
}).listen(config.port, () => console.log(`Demo generator API en puerto ${config.port}`));
