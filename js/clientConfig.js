const CONFIG_ROOT = new URL("../config/", import.meta.url);

async function fetchJson(path) {
  const response = await fetch(new URL(path, CONFIG_ROOT), { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

async function loadClientConfig() {
  const active = await fetchJson("activeClient.json");
  if (!active.client || !/^[a-z0-9_-]+$/i.test(active.client)) {
    throw new Error("config/activeClient.json no contiene un cliente válido");
  }

  const base = `clientes/${active.client}`;
  const [identity, variables, alarms, equipment, layout] = await Promise.all([
    fetchJson(`${base}/identidad.json`),
    fetchJson(`${base}/variables.json`),
    fetchJson(`${base}/limitesAlarmas.json`),
    fetchJson(`${base}/equipos.json`),
    fetchJson(`${base}/layoutVisible.json`)
  ]);

  const variableMap = Object.fromEntries(variables.variables.map((variable) => [variable.key, variable]));
  const equipmentMap = Object.fromEntries(equipment.equipos.map((item) => [item.nombre, item]));

  return Object.freeze({
    activeClient: active.client,
    identity,
    variables: variables.variables,
    variableMap,
    alarmVariables: alarms.variables,
    equipment: equipment.equipos,
    equipmentMap,
    layout
  });
}

export const clientConfig = await loadClientConfig();
export const PLANT_AREA = clientConfig.identity.areaPrincipal;

export function getVariable(key) {
  return clientConfig.variableMap[key];
}

export function getEquipmentByType(type) {
  return clientConfig.equipment.filter((item) => item.tipo === type);
}

export function formatConfiguredValue(value, variable) {
  if (!Number.isFinite(Number(value)) || !variable) return "--";
  return `${Number(value).toLocaleString(clientConfig.identity.locale, {
    minimumFractionDigits: variable.decimales,
    maximumFractionDigits: variable.decimales
  })} ${variable.unidad}`;
}
