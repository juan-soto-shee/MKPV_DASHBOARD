import { PILES } from "./config.js";
import { assertDemoClient, assertTransition } from "./validation.js";
import { asDate, createSessionId, nextNormalSlot } from "./timelineManager.js";
import { generateNormalCycle } from "./normalGenerator.js";
import { generateAcceleratedCycle } from "./acceleratedGenerator.js";
import { hasCompleteReturnPoint, restoreNormalTimeline } from "./restorationService.js";
import { generatorActivity } from "./activity.js";

export class DemoGeneratorService {
  constructor(repository, config, clock = () => new Date()) {
    assertDemoClient(config.clientId);
    this.repository = repository;
    this.config = config;
    this.clock = clock;
  }

  async status() {
    const state = await this.repository.getState() || {
      estado: "STOPPED", mode: "stopped", clientId: this.config.clientId,
      schedulerActive: false, processMode: null, lastHeartbeatAt: null
    };
    return { ...state, activity: generatorActivity(state, this.clock(), this.config.heartbeatTimeoutSeconds) };
  }

  async startNormal() {
    const state = await this.status();
    if (state.estado !== "NORMAL_RUNNING") assertTransition(state.estado, "NORMAL_RUNNING");
    const now = this.clock();
    return this.repository.saveState(clean({ ...state, estado: "NORMAL_RUNNING", mode: "normal",
      schedulerActive: true, processMode: "continuous", lastHeartbeatAt: now,
      intervaloNormal: this.config.normalIntervalMinutes,
      siguienteHorarioNormalEsperado: nextNormalSlot(now, this.config.normalIntervalMinutes), ultimoError: null }));
  }

  async heartbeat() {
    const state = await this.status();
    if (state.estado !== "NORMAL_RUNNING" || state.schedulerActive !== true || state.processMode !== "continuous") {
      throw new Error("No existe un scheduler normal activo");
    }
    return this.repository.saveState(clean({ ...state, lastHeartbeatAt: this.clock() }));
  }

  async stopNormal() {
    const state = await this.status();
    if (["DEMO_STARTING", "DEMO_RUNNING", "DEMO_STOPPING", "RESTORING_NORMAL"].includes(state.estado)) {
      throw new Error("No se puede detener durante una demo o restauración");
    }
    return this.repository.saveState(clean({ ...state, estado: "STOPPED", mode: "stopped",
      schedulerActive: false, processMode: null, lastHeartbeatAt: null }));
  }

  async pauseNormal() { return this.stopNormal(); }

  async normalOnce({ continuous = false } = {}) {
    const state = await this.status();
    if (!["NORMAL_RUNNING", "NORMAL_PAUSED", "STOPPED"].includes(state.estado)) throw new Error("El generador normal no está disponible");
    if (continuous && !(state.estado === "NORMAL_RUNNING" && state.schedulerActive === true && state.processMode === "continuous")) {
      throw new Error("Ciclo continuo rechazado: scheduler inactivo");
    }
    const result = await generateNormalCycle(this.repository, state, this.clock());
    const lastResult = { ok: true, registrosCreados: result.created.length, horario: result.records[0]?.hora || null };
    const lastByPile = Object.fromEntries(result.records.map((record) => [record.subarea, record]));
    await this.repository.saveState(clean({ ...state,
      estado: continuous ? "NORMAL_RUNNING" : "STOPPED", mode: continuous ? "normal" : "stopped",
      schedulerActive: continuous, processMode: continuous ? "continuous" : null,
      lastHeartbeatAt: continuous ? this.clock() : null,
      valoresActualesPorPila: result.values, ultimaEjecucionNormal: result.executedAt,
      lastExecutionAt: result.executedAt, ultimoResultado: lastResult, lastExecutionResult: lastResult,
      ultimoRegistroAutomaticoNormalPorPila: lastByPile,
      ultimoHorarioNormal: result.records[0] ? `${result.records[0].fecha} ${result.records[0].hora}` : null,
      registrosUltimoCiclo: result.created.length, ultimoError: null }));
    return result.created;
  }

  async reconcileState({ localSchedulerActive = false } = {}) {
    if (localSchedulerActive) throw new Error("Reconciliación rechazada: existe un scheduler local activo");
    const state = await this.status();
    if (["DEMO_STARTING", "DEMO_RUNNING", "DEMO_STOPPING", "RESTORING_NORMAL"].includes(state.estado) || state.sessionId || state.activeSessionId) {
      throw new Error("Reconciliación rechazada: existe una demo activa o restauración pendiente");
    }
    if (state.estado === "ERROR") throw new Error("Reconciliación rechazada: estado ERROR");
    if (generatorActivity(state, this.clock(), this.config.heartbeatTimeoutSeconds).active) {
      throw new Error("Reconciliación rechazada: heartbeat de scheduler vigente");
    }
    return this.repository.saveState(clean({ ...state, estado: "STOPPED", mode: "stopped",
      schedulerActive: false, processMode: null, lastHeartbeatAt: null, ultimoError: null }));
  }

  async startDemo(options = {}) {
    const state = await this.status(); assertTransition(state.estado, "DEMO_STARTING"); const sessionId = createSessionId(this.clock());
    await this.repository.saveState(clean({ ...state, estado: "DEMO_STARTING", sessionId, activeSessionId: sessionId, schedulerActive: false, processMode: null, lastHeartbeatAt: null }));
    try {
      const latest = await this.repository.latestNormalByPile(PILES); if (!hasCompleteReturnPoint(latest)) throw new Error("Falta un punto de retorno automático normal por pila");
      const bases = Object.fromEntries(PILES.map((p) => [p, pick(latest[p])]));
      const starting = clean({ ...state, estado: "DEMO_RUNNING", mode: "acelerado", sessionId, activeSessionId: sessionId,
        fechaHoraInicioDemoReal: this.clock(), tiempoSimulado: this.clock(), intervaloNormal: this.config.normalIntervalMinutes,
        ultimoRegistroAutomaticoNormalPorPila: latest, valoresBasePorPila: bases, valoresActualesPorPila: bases,
        siguienteHorarioNormalEsperado: nextNormalSlot(this.clock(), this.config.normalIntervalMinutes),
        generadorNormalEstabaActivo: state.estado === "NORMAL_RUNNING" && state.activity?.active === true,
        schedulerActive: false, processMode: null, lastHeartbeatAt: null,
        factorAceleracion: Number(options.factor || 240), simulatedStepMinutes: Number(options.simulatedStepMinutes || this.config.simulatedStepMinutes),
        escenario: options.scenario || "estable", registrosGenerados: 0, maxRegistrosPorPila: this.config.maxRecordsPerPile,
        maxDuracionSimulada: this.config.maxSimulatedHours, maxDuracionReal: this.config.maxRealMinutes, autoStop: this.config.autoStop, ultimoError: null });
      await this.repository.saveState(starting); await this.repository.addAudit({ accion: "demo_iniciada", clienteId: this.config.clientId, sessionId }); return starting;
    } catch (error) { await this.repository.saveState(clean({ ...state, estado: "ERROR", sessionId, activeSessionId: null, ultimoError: error.message })); throw error; }
  }

  async acceleratedOnce() { const state = await this.status(); const result = await generateAcceleratedCycle(this.repository, state); if (this.limitReached(result.state) && result.state.autoStop) return this.restore("limite_autostop"); return result; }
  async pauseDemo() { const state = await this.status(); if (state.estado !== "DEMO_RUNNING") throw new Error("No existe una demo activa"); return this.repository.saveState(clean({ ...state, demoPaused: true })); }
  async restore(reason = "manual") { const state = await this.status(); if (state.ultimaDemoFinalizada && !state.sessionId) return state; if (!["DEMO_RUNNING", "DEMO_STOPPING", "ERROR"].includes(state.estado)) throw new Error("No existe demo restaurable"); if (state.estado === "DEMO_RUNNING") await this.repository.saveState(clean({ ...state, estado: "DEMO_STOPPING", stopReason: reason })); await this.repository.saveState(clean({ ...state, estado: "RESTORING_NORMAL", stopReason: reason })); try { return await restoreNormalTimeline(this.repository, clean({ ...state, estado: "RESTORING_NORMAL", stopReason: reason }), this.clock()); } catch (error) { await this.repository.saveState(clean({ ...state, estado: "ERROR", ultimoError: error.message })); throw error; } }
  limitReached(s) { return s.registrosGenerados >= s.maxRegistrosPorPila * PILES.length || (asDate(s.tiempoSimulado) - asDate(s.fechaHoraInicioDemoReal)) / 3600000 >= s.maxDuracionSimulada || (this.clock() - asDate(s.fechaHoraInicioDemoReal)) / 60000 >= s.maxDuracionReal; }
}

const clean = ({ activity, ...state }) => state;
const pick = (r) => ({ flujoPLS: r.flujoPLS, cuPls: r.cuPls, flujoRefino: r.flujoRefino, acidezRefino: r.acidezRefino, nivelPiscinaPLS: r.nivelPiscinaPLS, nivelPiscinaRefino: r.nivelPiscinaRefino });
