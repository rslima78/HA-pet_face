declare const __BUILD_ID__: string;

/** Identificador do build (AAAAMMDDhhmm, UTC), definido pelo Vite. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
