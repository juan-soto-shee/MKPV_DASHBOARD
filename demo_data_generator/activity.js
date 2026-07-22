import { asDate } from "./timelineManager.js";

export function isHeartbeatFresh(state, now = new Date(), timeoutSeconds = 90) {
  if (!state?.lastHeartbeatAt) return false;
  const heartbeat = asDate(state.lastHeartbeatAt);
  return !Number.isNaN(heartbeat.getTime()) && now.getTime() - heartbeat.getTime() <= timeoutSeconds * 1000;
}

export function generatorActivity(state, now = new Date(), timeoutSeconds = 90) {
  const heartbeatFresh = isHeartbeatFresh(state, now, timeoutSeconds);
  const active = state?.estado === "NORMAL_RUNNING" && state?.schedulerActive === true && heartbeatFresh;
  return { active, heartbeatFresh, inconsistent: state?.estado === "NORMAL_RUNNING" && !active };
}
