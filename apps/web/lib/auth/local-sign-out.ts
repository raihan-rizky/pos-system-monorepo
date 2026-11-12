export type LocalAuthClient = {
  auth: {
    signOut(options: { scope: "local" }): Promise<{ error: Error | null }>;
  };
};

export async function signOutCurrentSession(client: LocalAuthClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (!error || error.name === "AuthSessionMissingError") return;
  const code = (error as Error & { code?: string }).code;
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used"
      || code === "session_not_found" || code === "session_expired") return;
  throw error;
}
