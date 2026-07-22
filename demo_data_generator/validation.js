import { DEMO_CLIENT } from "./config.js";
export const STATES = Object.freeze(["STOPPED","NORMAL_RUNNING","NORMAL_PAUSED","DEMO_STARTING","DEMO_RUNNING","DEMO_STOPPING","RESTORING_NORMAL","ERROR"]);
export const TRANSITIONS = Object.freeze({ STOPPED:["NORMAL_RUNNING","DEMO_STARTING"], NORMAL_RUNNING:["NORMAL_PAUSED","DEMO_STARTING","STOPPED"], NORMAL_PAUSED:["NORMAL_RUNNING","DEMO_STARTING","STOPPED"], DEMO_STARTING:["DEMO_RUNNING","ERROR"], DEMO_RUNNING:["DEMO_STOPPING","ERROR"], DEMO_STOPPING:["RESTORING_NORMAL","ERROR"], RESTORING_NORMAL:["NORMAL_RUNNING","STOPPED","ERROR"], ERROR:["RESTORING_NORMAL","STOPPED"] });
export function assertDemoClient(clientId) { if (clientId !== DEMO_CLIENT) throw new Error(`Cliente rechazado: ${clientId}`); }
export function assertTransition(from, to) { if (!TRANSITIONS[from]?.includes(to)) throw new Error(`Transición inválida: ${from} → ${to}`); }
