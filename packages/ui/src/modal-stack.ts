export const BASE_MODAL_Z_INDEX = 400;

const activeLayers = new Map<symbol, number>();

export function registerModalLayer(token: symbol): number {
  const existingLayer = activeLayers.get(token);
  if (existingLayer !== undefined) return existingLayer;

  let topLayer = BASE_MODAL_Z_INDEX - 1;
  for (const layer of activeLayers.values()) {
    topLayer = Math.max(topLayer, layer);
  }

  const layer = topLayer + 1;
  activeLayers.set(token, layer);
  return layer;
}

export function unregisterModalLayer(token: symbol): void {
  activeLayers.delete(token);
}
