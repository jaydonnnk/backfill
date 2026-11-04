export type MediaRequestPin={slot:'sam'|'image';endpoint:string;model:string;bodySha256:string;maxResponseBytes:number};
export function guardedMediaFetch(options:{directory:string;rawDirectory:string;requests:readonly MediaRequestPin[];upstream:typeof fetch}):typeof fetch;
