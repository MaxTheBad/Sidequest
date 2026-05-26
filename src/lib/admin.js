export const PRIVILEGED_ROLES = ["moderator", "admin", "super_admin"];

export function normalizeProfileRole(role) {
  const value = (role || "").toString().trim().toLowerCase();
  if (PRIVILEGED_ROLES.includes(value)) return value;
  if (value === "user") return "user";
  return "user";
}

export function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.includes(normalizeProfileRole(role));
}
