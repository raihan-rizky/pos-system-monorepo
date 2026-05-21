import { getCurrentUser, handleAuthError, AuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AuthError(401, "Unauthorized");
    }

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    return apiError("Failed to resolve current user", 500, {
      code: "InternalError",
    });
  }
}
