import { buildCycle } from "./generator.js";
import { scenarioBias } from "./scenarios.js";
import { asDate } from "./timelineManager.js";
export async function generateAcceleratedCycle(repository, state, random) {
  if(state.estado!=="DEMO_RUNNING"||!state.sessionId)throw new Error("No existe una demo activa");
  if(state.demoPaused)throw new Error("La demo está pausada");
  const processTime=new Date(asDate(state.tiempoSimulado).getTime()+state.simulatedStepMinutes*60000);
  const elapsed=(processTime-asDate(state.fechaHoraInicioDemoReal))/3600000;
  const records=buildCycle({previousByPile:state.valoresActualesPorPila,processTime,mode:"acelerado",sessionId:state.sessionId,factor:state.factorAceleracion,scenario:state.escenario,bias:scenarioBias(state.escenario,elapsed),random});
  const created=await repository.writeCycle(records);const values=Object.fromEntries(records.map((r)=>[r.subarea,{flujoPLS:r.flujoPLS,cuPls:r.cuPls,flujoRefino:r.flujoRefino,acidezRefino:r.acidezRefino,nivelPiscinaPLS:r.nivelPiscinaPLS,nivelPiscinaRefino:r.nivelPiscinaRefino}]));
  const next={...state,tiempoSimulado:processTime,valoresActualesPorPila:values,registrosGenerados:(state.registrosGenerados||0)+created.length};await repository.saveState(next);return {records:created,state:next};
}
