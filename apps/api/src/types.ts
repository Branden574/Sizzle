/** Hono context variables set by auth middleware. */
export interface AppVariables {
  userId?: string;
  accessToken?: string;
}

export interface AppEnv {
  Variables: AppVariables;
}
