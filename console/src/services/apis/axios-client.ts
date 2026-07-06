import Axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import Qs from 'qs';

// Create a more descriptively named instance
export const axiosInstance = Axios.create({
  baseURL: '',
  paramsSerializer: (params) => Qs.stringify(params, { arrayFormat: 'repeat' }),
  withCredentials: true,
});

import { getGlobalWorkspaceId } from '@/utils/workspaceState';

axiosInstance.interceptors.request.use((config) => {
  const workspaceId = getGlobalWorkspaceId();
  if (workspaceId) {
    config.headers.set('X-Workspace-Id', workspaceId);
  }

  const cleanValue = (v: unknown) => v !== null && v !== undefined && v !== '';

  if (config.params) {
    const cleanedParams = { ...config.params };
    for (const key in cleanedParams) {
      const value = cleanedParams[key];
      if (Array.isArray(value)) {
        const filtered = value.filter(cleanValue);
        if (filtered.length === 0) delete cleanedParams[key];
        else cleanedParams[key] = filtered;
      } else if (!cleanValue(value)) {
        delete cleanedParams[key];
      }
    }
    config.params = cleanedParams;
  }

  if (config.url && config.url.includes('?')) {
    const [baseUrl, queryString] = config.url.split('?');
    const searchParams = new URLSearchParams(queryString);
    let modified = false;

    const keys = Array.from(searchParams.keys());
    for (const key of keys) {
      const values = searchParams.getAll(key);
      const filtered = values.filter(cleanValue);

      if (filtered.length === 0) {
        searchParams.delete(key);
        modified = true;
      } else if (filtered.length !== values.length) {
        searchParams.delete(key);
        filtered.forEach((v) => searchParams.append(key, v));
        modified = true;
      }
    }

    if (modified) {
      const newQuery = searchParams.toString();
      config.url = newQuery ? `${baseUrl}?${newQuery}` : baseUrl;
    }
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // if (error.response?.status === 401) {
    //   window.location.href = '/login';
    // }
    return Promise.reject(error);
  },
);

/**
 * Axios client implementation for Orval-generated API clients
 * Used as the custom client instance for Orval API generation
 */
export const orvalClient = <T>(
  config: AxiosRequestConfig | string,
  options?: Record<string, unknown>,
): Promise<T> & { cancel: () => void } => {
  const source = Axios.CancelToken.source();
  const finalConfig = typeof config === 'string' ? { url: config } : config;
  const promise = axiosInstance<T>({
    ...finalConfig,
    ...options,
    ...(options?.body || options?.data
      ? { data: options?.body ?? options?.data }
      : {}),
    cancelToken: source.token,
  });

  const promiseWithCancel = promise as Promise<T> & { cancel: () => void };
  promiseWithCancel.cancel = () => {
    source.cancel('Request was cancelled');
  };

  return promiseWithCancel;
};

// Add more descriptive type names
export type HttpError<T = unknown> = AxiosError<T>;
export type RequestBody<T = unknown> = T;
