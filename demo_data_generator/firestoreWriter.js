import { createHash } from "node:crypto";
export class FirestoreRepository {
  constructor(db, FieldValue) { this.db=db; this.FieldValue=FieldValue; this.records=db.collection("leach_records"); this.stateRef=db.collection("demo_generator_state").doc("current"); }
  async getState(){const s=await this.stateRef.get();return s.exists?s.data():null;}
  async saveState(state){await this.stateRef.set({...state,timestampActualizacion:this.FieldValue.serverTimestamp()},{merge:true});return state;}
  async writeCycle(records){const batch=this.db.batch(),created=[];for(const record of records){const id=createHash("sha256").update(record.logicalKey).digest("hex");const ref=this.records.doc(id);if(!(await ref.get()).exists){batch.create(ref,{...record,timestampCreacion:this.FieldValue.serverTimestamp()});created.push(record);}}if(created.length)await batch.commit();return created;}
  async latestNormalByPile(piles){const result={};for(const pile of piles){const snap=await this.records.where("clienteId","==","demo_lixiviacion").where("origen","==","demo_generator").where("tipoRegistro","==","automatico_normal").where("subarea","==",pile).orderBy("timestampProceso","desc").limit(1).get();if(!snap.empty)result[pile]={id:snap.docs[0].id,...snap.docs[0].data()};}return result;}
  async hideSession(sessionId){const snap=await this.records.where("sessionId","==",sessionId).where("tipoRegistro","==","demo_acelerada").get();let count=0;for(let i=0;i<snap.docs.length;i+=400){const batch=this.db.batch();snap.docs.slice(i,i+400).forEach((d)=>batch.update(d.ref,{visibleOperacional:false}));await batch.commit();count+=Math.min(400,snap.docs.length-i);}return count;}
  async invalidateDemoPredictions(sessionId){const snap=await this.db.collection("predictions").where("sessionId","==",sessionId).get();const batch=this.db.batch();snap.docs.forEach((d)=>batch.update(d.ref,{visibleOperacional:false}));if(!snap.empty)await batch.commit();}
  async addAudit(entry){await this.db.collection("audit_log").add({...entry,timestamp:this.FieldValue.serverTimestamp()});}
}
export async function createFirestoreRepository(){const admin=await import("firebase-admin");if(!admin.default.apps.length)admin.default.initializeApp();return new FirestoreRepository(admin.default.firestore(),admin.default.firestore.FieldValue);}
