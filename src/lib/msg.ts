export interface Msg { key: string; params?: Record<string, string | number> }
export const msg = (key: string, params?: Msg['params']): Msg => (params ? { key, params } : { key });
