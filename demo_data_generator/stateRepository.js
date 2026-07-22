export class MemoryRepository {
  constructor() { this.state = null; this.records = []; this.audit = []; this.predictions = []; }
  async getState() { return structuredClone(this.state); }
  async saveState(state) { this.state = structuredClone(state); return this.getState(); }
  async writeCycle(records) { const created=[]; for (const record of records) if (!this.records.some((item)=>item.logicalKey===record.logicalKey)) { this.records.push(structuredClone(record)); created.push(record); } return created; }
  async latestNormalByPile(piles) { return Object.fromEntries(piles.map((pile)=>[pile, [...this.records].reverse().find((r)=>r.subarea===pile&&r.origen==="demo_generator"&&r.tipoRegistro==="automatico_normal"&&r.clienteId==="demo_lixiviacion")]).filter(([,v])=>v)); }
  async hideSession(sessionId) { let count=0; this.records.forEach((r)=>{if(r.sessionId===sessionId&&r.tipoRegistro==="demo_acelerada"&&r.visibleOperacional!==false){r.visibleOperacional=false;count++;}}); return count; }
  async invalidateDemoPredictions(sessionId) { this.predictions.forEach((p)=>{if(p.sessionId===sessionId)p.visibleOperacional=false;}); }
  async addAudit(entry) { this.audit.push(structuredClone(entry)); }
}
