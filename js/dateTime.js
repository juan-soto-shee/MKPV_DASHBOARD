const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function normalizeDateTime(valueFecha, valueHora = "", { rejectFuture = true, now = Date.now() } = {}) {
  const date = parseValue(valueFecha, valueHora);
  const timestampCreacion = date.getTime();
  if (rejectFuture && timestampCreacion > now + 60000) {
    throw new Error(`Fecha futura no permitida: ${localDate(date)} ${localTime(date)}`);
  }
  return { fecha: localDate(date), hora: localTime(date), timestampCreacion };
}

export function normalizeRecordDateTime(record, options = {}) {
  const direct = record?.timestampCreacion ?? record?.timestamp;
  return direct !== undefined && direct !== null && direct !== ""
    ? normalizeDateTime(direct, "", options)
    : normalizeDateTime(record?.fecha, record?.hora, options);
}

export function timestampMillis(value) {
  try { return normalizeDateTime(value, "", { rejectFuture: false }).timestampCreacion; }
  catch { return NaN; }
}

export function getReferenceTimestamp(records) {
  const timestamps = (records || []).map((record) => record?.timestampCreacion).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function filterRecordsByPeriod(records, hours) {
  const referenceTimestamp = getReferenceTimestamp(records);
  if (!Number.isFinite(referenceTimestamp)) return [];
  const windowStart = referenceTimestamp - Number(hours) * 3600000;
  return records.filter((record) => Number.isFinite(record.timestampCreacion)
    && record.timestampCreacion >= windowStart && record.timestampCreacion <= referenceTimestamp);
}

function parseValue(value, timeValue) {
  if (value?.toMillis) return valid(new Date(value.toMillis()));
  if (value?.toDate) return valid(value.toDate());
  if (Object.prototype.toString.call(value) === "[object Date]") {
    const date = valid(new Date(value.getTime()));
    return hasTimeValue(timeValue) ? withTime(date, timeValue) : date;
  }
  if (typeof value === "number") return numeric(value, timeValue);
  const text = normalizeDateText(value);
  const time = normalizeDateText(timeValue);
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return numeric(Number(text.replace(",", ".")), timeValue);
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) return valid(new Date(text));
  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T]+(.*))?$/)
    || text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[ T]+(.*))?$/);
  if (match) {
    const yearFirst = match[1].length === 4;
    const rawYear = Number(yearFirst ? match[1] : match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = local(year, Number(match[2]), Number(yearFirst ? match[3] : match[1]), match[4] || "");
    return !match[4] && hasTimeValue(timeValue) ? withTime(date, timeValue) : date;
  }
  throw new Error("Fecha u hora inválida");
}

function normalizeDateText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(a\.?\s*m\.?|am)\b/gi, "AM")
    .replace(/\b(p\.?\s*m\.?|pm)\b/gi, "PM");
}

function hasTimeValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function withTime(date, value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    const time = valid(new Date(value.getTime()));
    return local(date.getFullYear(), date.getMonth() + 1, date.getDate(),
      `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`);
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1) {
    const seconds = Math.round(value * 86400) % 86400;
    return local(date.getFullYear(), date.getMonth() + 1, date.getDate(),
      `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`);
  }
  const text = normalizeDateText(value);
  if (/^0?[.,]\d+$/.test(text)) {
    const fraction = Number(text.replace(",", "."));
    const seconds = Math.round(fraction * 86400) % 86400;
    return local(date.getFullYear(), date.getMonth() + 1, date.getDate(),
      `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`);
  }
  return local(date.getFullYear(), date.getMonth() + 1, date.getDate(), text);
}

function numeric(value, timeValue = "") {
  if (!Number.isFinite(value)) throw new Error("Fecha u hora inválida");
  if (value >= 1e12) return valid(new Date(value));
  if (value >= 1e9) return valid(new Date(value * 1000));
  if (value > 0 && value < 100000) {
    // Las fracciones de serial Excel suelen traer error binario; redondear al segundo evita 07:59:59.999.
    const excel = new Date(EXCEL_EPOCH_UTC + Math.round(value * 86400) * 1000);
    const date = local(excel.getUTCFullYear(), excel.getUTCMonth() + 1, excel.getUTCDate(),
      `${pad(excel.getUTCHours())}:${pad(excel.getUTCMinutes())}:${pad(excel.getUTCSeconds())}`);
    return hasTimeValue(timeValue) ? withTime(date, timeValue) : date;
  }
  throw new Error("Fecha u hora inválida");
}

function local(year, month, day, time = "") {
  const parts = normalizeDateText(time || "00:00:00").match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?(?:[.,]\d+)?\s*(AM|PM)?$/i);
  if (!parts) throw new Error("Fecha u hora inválida");
  let hours = Number(parts[1]);
  const minutes = Number(parts[2] || 0);
  const seconds = Number(parts[3] || 0);
  const meridiem = parts[4]?.toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) throw new Error("Fecha u hora fuera de rango");
    hours = hours % 12 + (meridiem === "PM" ? 12 : 0);
  }
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
      || date.getHours() !== hours || date.getMinutes() !== minutes || date.getSeconds() !== seconds) {
    throw new Error("Fecha u hora fuera de rango");
  }
  return date;
}

function valid(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Fecha u hora inválida");
  return date;
}
function pad(value) { return String(value).padStart(2, "0"); }
function localDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function localTime(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
