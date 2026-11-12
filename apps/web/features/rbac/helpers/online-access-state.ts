import type { SessionFailureKind } from "@/lib/auth/session-failure";
import type { CurrentRoleAccess } from "./permission-refresh";

export type OnlineAccessPhase = "checking" | "verified" | "recovering" | "unavailable" | "login-required" | "forbidden";
export type OnlineAccessState = {
  phase: OnlineAccessPhase;
  generation: number;
  snapshot: CurrentRoleAccess | null;
};

export type OnlineAccessEvent =
  | { type: "start-generation"; retainSnapshot?: boolean; phase?: "forbidden" | "login-required" }
  | { type: "retrying"; generation: number }
  | { type: "verified"; generation: number; snapshot: CurrentRoleAccess }
  | { type: "failed"; generation: number; kind: SessionFailureKind };

export function createOnlineAccessState(snapshot: CurrentRoleAccess | null): OnlineAccessState {
  return { phase: snapshot ? "verified" : "checking", generation: 0, snapshot };
}

export function reduceOnlineAccessState(state: OnlineAccessState, event: OnlineAccessEvent): OnlineAccessState {
  if (event.type === "start-generation") {
    const snapshot = event.retainSnapshot ? state.snapshot : null;
    return {
      generation: state.generation + 1,
      snapshot,
      phase: event.phase ?? (snapshot ? "recovering" : "checking"),
    };
  }
  if (event.generation !== state.generation || state.phase === "login-required") return state;
  if (event.type === "verified") return { ...state, phase: "verified", snapshot: event.snapshot };
  if (event.type === "failed" && (event.kind === "unauthenticated" || event.kind === "forbidden")) {
    return reduceOnlineAccessState(state, {
      type: "start-generation",
      phase: event.kind === "unauthenticated" ? "login-required" : "forbidden",
    });
  }
  if (state.phase === "forbidden") return state;
  return {
    ...state,
    phase: state.snapshot ? "recovering" : event.type === "failed" ? "unavailable" : state.phase,
  };
}
