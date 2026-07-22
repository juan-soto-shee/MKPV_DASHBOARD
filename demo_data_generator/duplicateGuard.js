export function logicalKey(record){return [record.clienteId,record.fecha,record.hora,record.subarea,record.tipoRegistro].join("|");}
export function deduplicate(records){const seen=new Set();return records.filter((record)=>{const key=logicalKey(record);if(seen.has(key))return false;seen.add(key);return true;});}
