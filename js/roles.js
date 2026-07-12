export const ROLES = Object.freeze({
  OPERATOR: "operator",
  SUPERVISOR: "supervisor",
  TECHNICAL: "technical_profile",
  METKINETICS_ADMIN: "metkinetics_admin"
});

export const ROLE_CAPABILITIES = Object.freeze({
  [ROLES.OPERATOR]: ["data:enter", "dashboard:view", "history:view"],
  [ROLES.SUPERVISOR]: ["data:enter", "dashboard:view", "history:view", "data:export"],
  [ROLES.TECHNICAL]: [
    "dashboard:view", "history:view", "alarms:configure", "kpi-targets:configure",
    "authorized-factors:configure", "process-parameters:configure", "reports:configure"
  ],
  [ROLES.METKINETICS_ADMIN]: ["plantview-admin:full-control"]
});

export function can(role, capability) {
  const capabilities = ROLE_CAPABILITIES[role] || [];
  return capabilities.includes("plantview-admin:full-control") || capabilities.includes(capability);
}
