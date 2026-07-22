import { loadConfig } from "./config.js";
import { createFirestoreRepository } from "./firestoreWriter.js";
import { DemoGeneratorService } from "./index.js";
import { Scheduler } from "./scheduler.js";

const command = process.argv[2] || "status", config = loadConfig();
process.env.TZ = config.timeZone;
if (command === "validate") {
  if (config.clientId !== "demo_lixiviacion") throw new Error("DEMO_GENERATOR_CLIENT_ID debe ser demo_lixiviacion");
  console.log("Configuración del generador válida (desactivado por defecto)."); process.exit(0);
}
if (!config.enabled) throw new Error("Generador desactivado. Configure DEMO_GENERATOR_ENABLED=true explícitamente.");
const service = new DemoGeneratorService(await createFirestoreRepository(), config), scheduler = new Scheduler();
if (command === "status") console.log(JSON.stringify(await service.status(), null, 2));
else if (command === "normal-once") console.log(JSON.stringify(await service.normalOnce(), null, 2));
else if (command === "normal-start") {
  scheduler.start(() => service.normalOnce({ continuous: true }), config.normalIntervalMinutes * 60000,
    () => service.heartbeat(), config.heartbeatIntervalSeconds * 1000);
  try { await service.startNormal(); } catch (error) { scheduler.stop(); throw error; }
  console.log("Generador normal iniciado");
}
else if (command === "accelerated-start") { await service.startDemo({ factor: 240, scenario: process.env.DEMO_GENERATOR_SCENARIO || "estable" }); scheduler.start(() => service.acceleratedOnce(), config.acceleratedIntervalSeconds * 1000); console.log("Demo acelerada iniciada"); }
else if (command === "stop") { scheduler.stop(); console.log(JSON.stringify(await service.stopNormal(), null, 2)); }
else if (command === "restore") console.log(JSON.stringify(await service.restore(), null, 2));
else if (command === "reconcile-state") console.log(JSON.stringify(await service.reconcileState({ localSchedulerActive: scheduler.running }), null, 2));
else throw new Error(`Comando desconocido: ${command}`);
