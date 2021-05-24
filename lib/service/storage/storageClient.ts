import { JSONObject } from '../../../index';

export interface StorageClient<T> {
  // @todo should be static
  buildClient (config: JSONObject): T;

  constructor (config: JSONObject, scope: 'public' | 'private');

  translateKoncordeFilters (filters: JSONObject): string | JSONObject;

  info (): Promise<JSONObject>;
}
