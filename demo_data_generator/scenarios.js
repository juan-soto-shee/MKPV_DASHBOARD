export const SCENARIOS = Object.freeze(["estable","degradacion_progresiva","baja_ley","bajo_flujo","acidez_alta","nivel_anormal","detencion_bomba","recuperacion_operacional"]);
export function scenarioBias(name, elapsedHours) {
  const progress = Math.min(1, Math.max(0, elapsedHours / 8));
  const map = {
    estable: {}, degradacion_progresiva: { cuPls: -.02 * progress, flujoPLS: -8 * progress },
    baja_ley: { cuPls: -.025 * progress }, bajo_flujo: { flujoPLS: -18 * progress, flujoRefino: -12 * progress },
    acidez_alta: { acidezRefino: .28 * progress }, nivel_anormal: { nivelPiscinaPLS: -1.8 * progress },
    detencion_bomba: { flujoPLS: -20 * progress, flujoRefino: -20 * progress },
    recuperacion_operacional: { cuPls: .02 * progress, flujoPLS: 16 * progress, flujoRefino: 14 * progress }
  };
  if (!SCENARIOS.includes(name)) throw new Error(`Escenario inválido: ${name}`);
  return map[name];
}
