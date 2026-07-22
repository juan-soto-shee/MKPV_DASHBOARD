import { PILES } from "./config.js";
import { buildCycle } from "./generator.js";
import { nextSlotFromBase } from "./timelineManager.js";
export async function restoreNormalTimeline(repository, state, now = new Date()) {
  if (!state?.sessionId) return state;
  await repository.hideSession(state.sessionId);
  await repository.invalidateDemoPredictions(state.sessionId);
  const baseTimes=Object.values(state.ultimoRegistroAutomaticoNormalPorPila||{}).map((r)=>r.timestampProceso||r.timestampCreacion).filter(Boolean);
  const next = nextSlotFromBase(baseTimes[0]||now,now,state.intervaloNormal || 240);
  const restored = { ...state, estado: "STOPPED", mode: "stopped", sessionId: null, activeSessionId: null,
    schedulerActive: false, processMode: null, lastHeartbeatAt: null,
    valoresActualesPorPila: state.valoresBasePorPila,
    siguienteHorarioNormalEsperado: next, ultimaDemoFinalizada: state.sessionId, motivoFinalizacion: state.stopReason || "manual", ultimoError: null };
  await repository.saveState(restored);
  await repository.addAudit({ accion:"demo_restaurada",clienteId:"demo_lixiviacion",sessionId:state.sessionId,motivo:restored.motivoFinalizacion });
  return restored;
}
export function restorationCycle(state, processTime) { return buildCycle({ previousByPile: state.valoresBasePorPila, processTime, mode:"normal" }); }
export function hasCompleteReturnPoint(records) { return PILES.every((pile)=>records?.[pile]?.tipoRegistro==="automatico_normal"&&records[pile]?.origen==="demo_generator"); }
