/** Device pixel ratio capped at 2 and, when a budget is given, shrunk so the canvas stays under `maxPixels` total. */
export function pixelRatioFor(devicePixelRatio: number, width: number, height: number, maxPixels: number): number {
  return Math.min(devicePixelRatio, 2, Math.sqrt(maxPixels / (width * height)));
}
