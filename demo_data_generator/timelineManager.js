export function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return { fecha: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, hora: `${pad(date.getHours())}:${pad(date.getMinutes())}:00` };
}
export function asDate(value) { return value?.toDate ? value.toDate() : new Date(value); }
export function calculateShift(date) { return date.getHours() < 8 ? "C" : date.getHours() < 16 ? "A" : "B"; }
export function floorToInterval(date, minutes) {
  const result = new Date(date); result.setSeconds(0, 0);
  result.setMinutes(Math.floor(result.getMinutes() / minutes) * minutes); return result;
}
export function nextNormalSlot(now, minutes) { return new Date(floorToInterval(now, minutes).getTime() + minutes * 60000); }
export function nextSlotFromBase(base, now, minutes) { let next=new Date(asDate(base).getTime()+minutes*60000);while(next<=now)next=new Date(next.getTime()+minutes*60000);return next; }
export function createSessionId(now = new Date()) {
  const { fecha, hora } = formatDateTime(now); return `demo_${fecha.replaceAll("-", "")}_${hora.replaceAll(":", "").slice(0, 6)}`;
}
