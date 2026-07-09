const CONFIG_ROOT = new URL("../config/", import.meta.url);

async function fetchJson(path) {
  const response = await fetch(new URL(path, CONFIG_ROOT), { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

async function loadClientConfig() {
  const active = await fetchJson("activeClient.json");
  const activeClient = active.activeClient || active.client;
  if (!activeClient || !/^[a-z0-9_-]+$/i.test(activeClient)) {
    throw new Error("config/activeClient.json no contiene un cliente válido");
  }

  const base = `clientes/${activeClient}`;
  const [identity, variables, alarms, equipment, layout] = await Promise.all([
    fetchJson(`${base}/identidad.json`),
    fetchJson(`${base}/variables.json`),
    fetchJson(`${base}/limitesAlarmas.json`),
    fetchJson(`${base}/equipos.json`),
    fetchJson(`${base}/layoutVisible.json`)
  ]);
  const clientProfileResult = await loadClientProfile(base, activeClient, identity);

  const variableMap = Object.fromEntries(variables.variables.map((variable) => [variable.key, variable]));
  const equipmentMap = Object.fromEntries(equipment.equipos.map((item) => [item.nombre, item]));

  return Object.freeze({
    activeClient,
    clientProfile: clientProfileResult.profile,
    configStatus: clientProfileResult.status,
    identity,
    variables: variables.variables,
    variableMap,
    alarmVariables: alarms.variables,
    equipment: equipment.equipos,
    equipmentMap,
    layout
  });
}

async function loadClientProfile(base, activeClient, identity) {
  try {
    const profile = await fetchJson(`${base}/client.json`);
    return {
      profile: normalizeClientProfile(profile, activeClient, identity),
      status: {
        ok: true,
        message: "Configuración cargada correctamente",
        fallbackName: ""
      }
    };
  } catch (error) {
    console.warn("No se pudo cargar client.json; se usará DemoClientConfig:", error.message);
    return {
      profile: normalizeClientProfile({}, activeClient, identity),
      status: {
        ok: false,
        message: "Error cargando configuración. Se utilizará DemoClientConfig.",
        fallbackName: "DemoClientConfig"
      }
    };
  }
}

function normalizeClientProfile(profile, activeClient, identity) {
  return Object.freeze({
    cliente: profile.cliente || identity.marca,
    faena: profile.faena || identity.titulo,
    proceso: profile.proceso || identity.proceso,
    clienteId: profile.clienteId || activeClient,
    versionConfiguracion: profile.versionConfiguracion || identity.version,
    estado: profile.estado || "Activo"
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
