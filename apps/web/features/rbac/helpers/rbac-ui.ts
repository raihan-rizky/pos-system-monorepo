import type { ResourceAction } from "./rbac-core";

type CanPerform = (resource: string, action: ResourceAction) => boolean;

export function shouldShowAction(
  resource: string,
  action: ResourceAction,
  canPerform: CanPerform,
) {
  return canPerform(resource, action);
}

export function shouldShowUpdateAction(resource: string, canPerform: CanPerform) {
  return shouldShowAction(resource, "update", canPerform);
}

export function shouldShowDeleteAction(
  resource: string,
  canPerform: CanPerform,
) {
  return shouldShowAction(resource, "delete", canPerform);
}
