const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function normalizeDateTime(valueFecha, valueHora = "", { rejectFuture = true, now = Date.now() } = {}) {
  const date = parseValue(valueFecha, valueHora);
  const timestampCreacion = date.getTime();
  if (rejectFuture && timestampCreacion > now + 1000) throw new Error("Fecha futura no permitida");
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

function parseValue(value, timeValue) {
  if (value?.toMillis) return valid(new Date(value.toMillis()));
  if (value?.toDate) return valid(value.toDate());
  if (Object.prototype.toString.call(value) === "[object Date]") return valid(new Date(value.getTime()));
  if (typeof value === "number") return numeric(value);
  const text = String(value ?? "").trim();
  const time = String(timeValue ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return numeric(Number(text));
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) return valid(new Date(text));
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](.*))?$/)
    || text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](.*))?$/);
  if (match) {
    const yearFirst = match[1].length === 4;
    return local(Number(yearFirst ? match[1] : match[3]), Number(match[2]),
      Number(yearFirst ? match[3] : match[1]), match[4] || time);
  }
  throw new Error("Fecha u hora inválida");
}

function numeric(value) {
  if (!Number.isFinite(value)) throw new Error("Fecha u hora inválida");
  if (value >= 1e12) return valid(new Date(value));
  if (value >= 1e9) return valid(new Date(value * 1000));
  if (value > 0 && value < 100000) {
    // Las fracciones de serial Excel suelen traer error binario; redondear al segundo evita 07:59:59.999.
    const excel = new Date(EXCEL_EPOCH_UTC + Math.round(value * 86400) * 1000);
    return local(excel.getUTCFullYear(), excel.getUTCMonth() + 1, excel.getUTCDate(),
      `${pad(excel.getUTCHours())}:${pad(excel.getUTCMinutes())}:${pad(excel.getUTCSeconds())}`);
  }
  throw new Error("Fecha u hora inválida");
}

function local(year, month, day, time = "") {
  const parts = String(time || "00:00:00").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (!parts) throw new Error("Fecha u hora inválida");
  const date = new Date(year, month - 1, day, +parts[1], +parts[2], +(parts[3] || 0));
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
      || date.getHours() !== +parts[1] || date.getMinutes() !== +parts[2]) throw new Error("Fecha u hora fuera de rango");
  return date;
}

function valid(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Fecha u hora inválida");
  return date;
}
function pad(value) { return String(value).padStart(2, "0"); }
function localDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function localTime(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
