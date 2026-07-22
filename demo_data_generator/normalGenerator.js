import { BASE_VALUES } from "./ranges.js";
import { buildCycle } from "./generator.js";
export async function generateNormalCycle(repository, state, now = new Date(), random) {
  const previous = state?.valoresActualesPorPila || state?.valoresBasePorPila || BASE_VALUES;
  const records = buildCycle({ previousByPile: previous, processTime: now, mode:"normal", random });
  const created = await repository.writeCycle(records);
  const values = Object.fromEntries(records.map((r)=>[r.subarea,pickValues(r)]));
  return { created, records, values, executedAt: now };
}
const pickValues=(r)=>({flujoPLS:r.flujoPLS,cuPls:r.cuPls,flujoRefino:r.flujoRefino,acidezRefino:r.acidezRefino,nivelPiscinaPLS:r.nivelPiscinaPLS,nivelPiscinaRefino:r.nivelPiscinaRefino});
