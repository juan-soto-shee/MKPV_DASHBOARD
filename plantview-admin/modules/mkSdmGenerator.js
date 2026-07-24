const TURNOS = ["A", "B", "C"];
import { RANGES } from "./mkSdmRanges.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function generateDryRunCycle() {
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const turno = TURNOS[Math.floor(now.getHours() / 8) % TURNOS.length];
  const cuPlsBase = 1.15 + Math.random() * 0.12;
  const flujoPlsBase = 980 + Math.random() * 50;
  const flujoRefinoBase = 980 + Math.random() * 50;
  const acidezBase = 15.0 + Math.random() * 1.4;
  const nivelRefinoBase = 60 + Math.random() * 10;
  const nivelPlsBase = 60 + Math.random() * 10;
  return [
    {
      pila: 1,
      fecha,
      hora,
      turno,
      area: "PLANTAS",
      subarea: "LIXIVIACIÓN",
      flujoPLS: clamp(Math.round(flujoPlsBase * 10) / 10, RANGES.flujoPLS.min, RANGES.flujoPLS.max),
      flujoRefino: clamp(Math.round((flujoRefinoBase) * 10) / 10, RANGES.flujoRefino.min, RANGES.flujoRefino.max),
      acidezRefino: clamp(Math.round(acidezBase * 100) / 100, RANGES.acidezRefino.min, RANGES.acidezRefino.max),
      cuPls: clamp(Math.round(cuPlsBase * 1000) / 1000, RANGES.cuPls.min, RANGES.cuPls.max),
      nivelPiscinaRefino: clamp(Math.round(nivelRefinoBase * 100) / 100, RANGES.nivelPiscinaRefino.min, RANGES.nivelPiscinaRefino.max),
      nivelPiscinaPLS: clamp(Math.round(nivelPlsBase * 100) / 100, RANGES.nivelPiscinaPLS.min, RANGES.nivelPiscinaPLS.max)
    },
    {
      pila: 2,
      fecha,
      hora,
      turno,
      area: "PLANTAS",
      subarea: "LIXIVIACIÓN",
      flujoPLS: clamp(Math.round((flujoPlsBase + 18 + Math.random() * 14) * 10) / 10, RANGES.flujoPLS.min, RANGES.flujoPLS.max),
      flujoRefino: clamp(Math.round((flujoRefinoBase + 18 + Math.random() * 14) * 10) / 10, RANGES.flujoRefino.min, RANGES.flujoRefino.max),
      acidezRefino: clamp(Math.round((acidezBase - 1.5 + Math.random() * 2.5) * 100) / 100, RANGES.acidezRefino.min, RANGES.acidezRefino.max),
      cuPls: clamp(Math.round((cuPlsBase + 0.35 + Math.random() * 0.45) * 1000) / 1000, RANGES.cuPls.min, RANGES.cuPls.max),
      nivelPiscinaRefino: clamp(Math.round((nivelRefinoBase - 0.25 + Math.random() * 0.45) * 100) / 100, RANGES.nivelPiscinaRefino.min, RANGES.nivelPiscinaRefino.max),
      nivelPiscinaPLS: clamp(Math.round((nivelPlsBase + 0.2 + Math.random() * 0.35) * 100) / 100, RANGES.nivelPiscinaPLS.min, RANGES.nivelPiscinaPLS.max)
    },
    {
      pila: 3,
      fecha,
      hora,
      turno,
      area: "PLANTAS",
      subarea: "LIXIVIACIÓN",
      flujoPLS: clamp(Math.round((flujoPlsBase - 12 + Math.random() * 18) * 10) / 10, RANGES.flujoPLS.min, RANGES.flujoPLS.max),
      flujoRefino: clamp(Math.round((flujoRefinoBase - 12 + Math.random() * 18) * 10) / 10, RANGES.flujoRefino.min, RANGES.flujoRefino.max),
      acidezRefino: clamp(Math.round((acidezBase + 1.2 + Math.random() * 3.8) * 100) / 100, RANGES.acidezRefino.min, RANGES.acidezRefino.max),
      cuPls: clamp(Math.round((cuPlsBase - 0.25 + Math.random() * 0.7) * 1000) / 1000, RANGES.cuPls.min, RANGES.cuPls.max),
      nivelPiscinaRefino: clamp(Math.round((nivelRefinoBase + 0.35 + Math.random() * 0.3) * 100) / 100, RANGES.nivelPiscinaRefino.min, RANGES.nivelPiscinaRefino.max),
      nivelPiscinaPLS: clamp(Math.round((nivelPlsBase - 0.25 + Math.random() * 0.45) * 100) / 100, RANGES.nivelPiscinaPLS.min, RANGES.nivelPiscinaPLS.max)
    }
  ];
}
