import http from "node:http";
import { loadConfig } from "./config.js";
import { createFirestoreRepository } from "./firestoreWriter.js";
import { DemoGeneratorService } from "./index.js";
import { Scheduler } from "./scheduler.js";

const config = loadConfig();
if (!config.enabled) throw new Error("DEMO_GENERATOR_ENABLED debe estar activo para iniciar el servicio");
process.env.TZ = config.timeZone;
const admin = (await import("firebase-admin")).default;
const repository = await createFirestoreRepository(), service = new DemoGeneratorService(repository, config), scheduler = new Scheduler();

async function authorize(req) { const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""); if (!token) throw new Error("Token requerido"); const decoded = await admin.auth().verifyIdToken(token); const email = decoded.email?.toLowerCase(); const snap = await admin.firestore().collection("admin_users").doc(email || "_").get(); if (!snap.exists || snap.data().activo !== true || snap.data().rol !== "metkinetics_admin") throw new Error("Acceso administrativo requerido"); }
const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" }); res.end(JSON.stringify(data)); };
const startNormalScheduler = () => scheduler.start(() => service.normalOnce({ continuous: true }), config.normalIntervalMinutes * 60000, () => service.heartbeat(), config.heartbeatIntervalSeconds * 1000);

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  try {
    await authorize(req);
    const body = await new Promise((resolve, reject) => { let raw = ""; req.on("data", c => raw += c); req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } }); });
    const path = new URL(req.url, "http://localhost").pathname; let result;
    if (path === "/status") result = await service.status();
    else if (path === "/normal/start") { startNormalScheduler(); try { result = await service.startNormal(); } catch (error) { scheduler.stop(); throw error; } }
    else if (path === "/normal/pause") { scheduler.stop(); result = await service.stopNormal(); }
    else if (path === "/normal/once") { scheduler.stop(); result = await service.normalOnce(); }
    else if (path === "/demo/start") { scheduler.stop(); result = await service.startDemo(body); scheduler.start(() => service.acceleratedOnce(), config.acceleratedIntervalSeconds * 1000); }
    else if (path === "/demo/pause") { scheduler.stop(); result = await service.pauseDemo(); }
    else if (path === "/demo/step") result = await service.acceleratedOnce();
    else if (path === "/demo/restore") { scheduler.stop(); result = await service.restore(body.reason); }
    else return json(res, 404, { error: "Ruta no encontrada" });
    json(res, 200, result);
  } catch (error) { json(res, 400, { error: error.message }); }
}).listen(config.port, () => console.log(`Demo generator API en puerto ${config.port}`));
