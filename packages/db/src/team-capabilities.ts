/** Meet exports, billing, USA Swimming team settings */
export const EXPORT_ROLES = ["owner", "head_coach"] as const;

export type ExportRole = (typeof EXPORT_ROLES)[number];

/** Same roles as {@link EXPORT_ROLES} (single source of truth). */
export const TEAM_MANAGEMENT_ROLES = EXPORT_ROLES;

export type TeamManagementRole = ExportRole;

/** Roster file import/export (often delegated to assistants). */
export const ROSTER_MANAGEMENT_ROLES = [
  "owner",
  "head_coach",
  "assistant_coach",
] as const;

export type RosterManagementRole = (typeof ROSTER_MANAGEMENT_ROLES)[number];

/** Running a hosted meet: publishing results, downloading its program. */
export const MEET_HOSTING_ROLES = ROSTER_MANAGEMENT_ROLES;

export type TeamCapabilities = {
  canManageTeam: boolean;
  canManageRosterFiles: boolean;
};

const MANAGE_TEAM_ROLES = new Set<string>(EXPORT_ROLES);
const ROSTER_FILE_ROLES = new Set<string>(ROSTER_MANAGEMENT_ROLES);

export function canManageTeam(role: string | null | undefined): boolean {
  if (!role) return false;
  return MANAGE_TEAM_ROLES.has(role);
}

export function canManageRosterFiles(role: string | null | undefined): boolean {
  if (!role) return false;
  return ROSTER_FILE_ROLES.has(role);
}

/** Meet / HY3 export permission (owner / head coach). */
export function roleHasExportAccess(role: string): boolean {
  return canManageTeam(role);
}

export function getTeamCapabilities(
  role: string | null | undefined,
): TeamCapabilities {
  return {
    canManageTeam: canManageTeam(role),
    canManageRosterFiles: canManageRosterFiles(role),
  };
}
