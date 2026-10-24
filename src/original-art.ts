// Shared original images are registered here after their actual files are supplied.
// Paths are relative to public/, so Vite's deployment base is respected.
export type ImageFormat = 'card' | 'editor' | 'portrait';
export const ORIGINAL_ART: Record<string, { path: string; format: ImageFormat }> = {};
