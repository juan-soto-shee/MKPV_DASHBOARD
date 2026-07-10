const CONFIG_ROOT = new URL("../config/", import.meta.url);
const DEFAULT_FIREBASE_CONFIG = Object.freeze({
  coleccionRegistros: "leach_records",
  coleccionConfiguracion: "configuration",
  coleccionConfiguracionLegacy: "alarm_config",
  documentoConfiguracion: "lixiviacion"
});

async function fetchJson(path) {
  const response = await fetch(new URL(path, CONFIG_ROOT), { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    return await fetchJson(path);
  } catch (error) {
    if (String(error.message).includes("(404)")) return null;
    throw error;
  }
}

function getUrlSelection() {
  const params = new URLSearchParams(window.location.search);
  const implementation = params.get("implementation");
  if (isValidId(implementation)) {
    return { implementationId: implementation, source: "url:implementation" };
  }

  const legacyProfile = params.get("profile");
  if (isValidId(legacyProfile)) {
    return { implementationId: legacyProfile, source: "url:profile-legacy" };
  }

  return null;
}

async function resolveActiveImplementation() {
  const urlSelection = getUrlSelection();
  if (urlSelection) return urlSelection;

  const activeImplementation = await fetchOptionalJson("activeImplementation.json");
  const implementationId = activeImplementation?.activeImplementation || activeImplementation?.implementation;
  if (isValidId(implementationId)) {
    return { implementationId, source: "activeImplementation.json" };
  }

  const activeClient = await fetchJson("activeClient.json");
  const legacyId = activeClient.activeClient || activeClient.client;
  if (!isValidId(legacyId)) {
    throw new Error("No existe una implementacion activa valida en config/activeImplementation.json ni config/activeClient.json");
  }
  return { implementationId: legacyId, source: "activeClient.json-legacy" };
}

async function loadClientConfig() {
  const active = await resolveActiveImplementation();
  const implementationId = active.implementationId;
  console.info("Implementacion activa:");
  console.info(implementationId);
  console.info("Fuente seleccion:");
  console.info(active.source);

  const customerResult = await loadCustomer(implementationId);
  const customer = customerResult.customer;
  const profileId = customer.profileId || implementationId;
  if (!isValidId(profileId)) throw new Error(`profileId invalido para ${implementationId}`);

  const profileResult = await loadProfile(profileId, implementationId);
  const profile = profileResult.profile;
  const legacyIdentity = await loadLegacyIdentity(implementationId, profileId);
  const identity = buildIdentity(customer, legacyIdentity);
  const layout = profile.layout;
  const equipment = getProfileEquipment(profile.process, profile.legacyEquipment);
  const variableMap = Object.fromEntries(profile.variables.variables.map((variable) => [variable.key, variable]));
  const equipmentMap = Object.fromEntries(equipment.map((item) => [item.nombre, item]));

  return Object.freeze({
    activeClient: customer.clienteId,
    activeImplementation: implementationId,
    implementationId,
    clienteId: customer.clienteId,
    clientName: customer.clientName,
    siteName: customer.siteName,
    processName: customer.processName,
    profileId,
    clientProfile: buildClientProfile(customer),
    configStatus: buildConfigStatus(customerResult, profileResult, active.source),
    identity,
    variables: profile.variables.variables,
    variableMap,
    alarms: profile.alarms,
    alarmVariables: profile.alarms.variables || [],
    equipment,
    equipmentMap,
    layout,
    process: profile.process,
    profileDocuments: Object.freeze({
      alarms: profile.alarms,
      layout,
      process: profile.process
    })
  });
}

async function loadCustomer(implementationId) {
  const customer = await fetchOptionalJson(`customers/${implementationId}/client.json`);
  if (customer) {
    return {
      customer: normalizeCustomer(customer, implementationId),
      status: { ok: true, source: `customers/${implementationId}/client.json`, legacy: false }
    };
  }

  console.warn(`Ruta nueva de customer no disponible para ${implementationId}; usando config/clientes legacy.`);
  const legacyIdentity = await fetchJson(`clientes/${implementationId}/identidad.json`);
  const legacyClient = await fetchOptionalJson(`clientes/${implementationId}/client.json`);
  return {
    customer: normalizeLegacyCustomer(legacyClient || {}, legacyIdentity, implementationId),
    status: { ok: true, source: `clientes/${implementationId}/`, legacy: true }
  };
}

async function loadProfile(profileId, implementationId) {
  const profileBase = `profiles/${profileId}`;
  const [variables, alarms, layout, process] = await Promise.all([
    fetchOptionalJson(`${profileBase}/variables.json`),
    fetchOptionalJson(`${profileBase}/alarms.json`),
    fetchOptionalJson(`${profileBase}/layout.json`),
    fetchOptionalJson(`${profileBase}/process.json`)
  ]);

  if (variables && alarms && layout) {
    return {
      profile: { variables, alarms, layout, process: process || {}, legacyEquipment: null },
      status: { ok: true, source: profileBase, legacy: false }
    };
  }

  const legacyBase = legacyProfileBase(profileId, implementationId);
  console.warn(`Perfil ${profileId} incompleto en ruta nueva; usando ${legacyBase} como fallback legacy.`);
  const [legacyVariables, legacyAlarms, legacyEquipment, legacyLayout, legacyProcess] = await Promise.all([
    fetchJson(`${legacyBase}/variables.json`),
    fetchJson(`${legacyBase}/limitesAlarmas.json`),
    fetchJson(`${legacyBase}/equipos.json`),
    fetchJson(`${legacyBase}/layoutVisible.json`),
    fetchOptionalJson(`${legacyBase}/process.json`)
  ]);
  return {
    profile: {
      variables: legacyVariables,
      alarms: legacyAlarms,
      layout: legacyLayout,
      process: legacyProcess || {},
      legacyEquipment
    },
    status: { ok: true, source: legacyBase, legacy: true }
  };
}

async function loadLegacyIdentity(implementationId, profileId) {
  return await fetchOptionalJson(`clientes/${implementationId}/identidad.json`)
    || await fetchOptionalJson(`${legacyProfileBase(profileId, implementationId)}/identidad.json`)
    || {};
}

function normalizeCustomer(customer, implementationId) {
  const normalized = {
    implementationId: customer.implementationId || implementationId,
    clienteId: customer.clienteId || implementationId,
    clientName: customer.clientName || customer.cliente,
    siteName: customer.siteName || customer.faena,
    processName: customer.processName || customer.proceso,
    profileId: customer.profileId || implementationId,
    version: customer.version || customer.versionConfiguracion || "1.0",
    enabled: customer.enabled !== false
  };
  validateCustomer(normalized, implementationId);
  return Object.freeze(normalized);
}

function normalizeLegacyCustomer(customer, identity, implementationId) {
  return normalizeCustomer({
    implementationId,
    clienteId: customer.clienteId || implementationId,
    clientName: customer.clientName || customer.cliente || identity.marca,
    siteName: customer.siteName || customer.faena || identity.titulo,
    processName: customer.processName || customer.proceso || identity.proceso,
    profileId: customer.profileId || implementationId,
    version: customer.version || customer.versionConfiguracion || identity.version,
    enabled: customer.enabled ?? customer.estado !== "Inactivo"
  }, implementationId);
}

function validateCustomer(customer, implementationId) {
  if (!isValidId(customer.implementationId) || customer.implementationId !== implementationId) {
    throw new Error(`customers/${implementationId}/client.json no coincide con la implementacion activa`);
  }
  if (!isValidId(customer.clienteId)) throw new Error(`clienteId invalido para ${implementationId}`);
  if (!isValidId(customer.profileId)) throw new Error(`profileId invalido para ${implementationId}`);
  if (!customer.enabled) throw new Error(`La implementacion ${implementationId} esta deshabilitada`);
}

function buildIdentity(customer, legacyIdentity) {
  const title = `${customer.siteName} | ${customer.processName}`;
  return Object.freeze({
    id: customer.implementationId,
    marca: customer.clientName,
    titulo: title,
    tituloPagina: legacyIdentity.tituloPagina || `MetKinetics PlantView | ${customer.processName}`,
    proceso: customer.processName,
    areaPrincipal: legacyIdentity.areaPrincipal || "PLANTA",
    locale: legacyIdentity.locale || "es-CL",
    version: legacyIdentity.version || `PlantView ${customer.version}`,
    firebase: Object.freeze({
      ...DEFAULT_FIREBASE_CONFIG,
      ...(legacyIdentity.firebase || {})
    })
  });
}

function buildClientProfile(customer) {
  return Object.freeze({
    cliente: customer.clientName,
    faena: customer.siteName,
    proceso: customer.processName,
    implementationId: customer.implementationId,
    profileId: customer.profileId,
    clienteId: customer.clienteId,
    versionConfiguracion: customer.version,
    estado: customer.enabled ? "Activo" : "Inactivo"
  });
}

function buildConfigStatus(customerResult, profileResult, source) {
  const legacy = [customerResult.status, profileResult.status].filter((item) => item.legacy);
  return Object.freeze({
    ok: true,
    message: legacy.length
      ? "Configuracion cargada con fallback legacy temporal"
      : "Configuracion cargada correctamente",
    fallbackName: legacy.map((item) => item.source).join(" | "),
    source
  });
}

function getProfileEquipment(process, legacyEquipment) {
  return (legacyEquipment?.equipos || process?.equipos || []).map((item) => ({
    ...item,
    tipo: normalizeEquipmentType(item.tipo)
  }));
}

function normalizeEquipmentType(type) {
  if (type === "pump") return "bomba";
  if (type === "pool") return "piscina";
  return type;
}

function legacyProfileBase(profileId, implementationId) {
  if (profileId === "lixiviacion") return "clientes/demo_lixiviacion";
  if (profileId === "entrefases") return "clientes/entrefases_profile";
  return `clientes/${implementationId}`;
}

function isValidId(value) {
  return typeof value === "string" && /^[a-z0-9_-]+$/i.test(value);
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
