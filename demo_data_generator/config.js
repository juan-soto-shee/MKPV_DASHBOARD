export const DEMO_CLIENT = "demo_lixiviacion";
export const IMPLEMENTATION_ID = "demo_lixiviacion";
export const PROFILE_ID = "lixiviacion";
export const PILES = Object.freeze(["Pila 1", "Pila 2", "Pila 3"]);

const number = (env, key, fallback) => Number.isFinite(Number(env[key])) ? Number(env[key]) : fallback;
const bool = (env, key, fallback) => env[key] == null ? fallback : String(env[key]).toLowerCase() === "true";

export function loadConfig(env = process.env) {
  return Object.freeze({
    enabled: bool(env, "GENERATOR_ENABLED", bool(env, "DEMO_GENERATOR_ENABLED", false)),
    schedulerEnabled: bool(env, "SCHEDULER_ENABLED", false),
    demoEnabled: bool(env, "DEMO_ENABLED", false),
    allowNormalGeneration: bool(env, "ALLOW_NORMAL_GENERATION", false),
    allowAcceleratedDemo: bool(env, "ALLOW_ACCELERATED_DEMO", false),
    clientId: env.DEMO_GENERATOR_CLIENT_ID || DEMO_CLIENT,
    normalIntervalMinutes: number(env, "DEMO_GENERATOR_NORMAL_INTERVAL_MINUTES", 240),
    acceleratedIntervalSeconds: number(env, "DEMO_GENERATOR_ACCELERATED_INTERVAL_SECONDS", 10),
    simulatedStepMinutes: number(env, "DEMO_GENERATOR_SIMULATED_STEP_MINUTES", 60),
    maxRecordsPerPile: number(env, "DEMO_GENERATOR_MAX_RECORDS_PER_PILE", 168),
    maxSimulatedHours: number(env, "DEMO_GENERATOR_MAX_SIMULATED_HOURS", 168),
    maxRealMinutes: number(env, "DEMO_GENERATOR_MAX_REAL_MINUTES", 60),
    autoStop: bool(env, "DEMO_GENERATOR_AUTO_STOP", true),
    heartbeatIntervalSeconds: number(env, "DEMO_GENERATOR_HEARTBEAT_INTERVAL_SECONDS", 30),
    heartbeatTimeoutSeconds: number(env, "DEMO_GENERATOR_HEARTBEAT_TIMEOUT_SECONDS", 90),
    timeZone: env.DEMO_GENERATOR_TIME_ZONE || "America/Santiago",
    port: number(env, "PORT", number(env, "DEMO_GENERATOR_API_PORT", 8080))
  });
}
