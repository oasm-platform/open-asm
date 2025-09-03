import { getGlobalWorkspaceId } from '@/utils/workspaceState';
import Axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import Qs from 'qs';

// Create a more descriptively named instance
export const axiosInstance = Axios.create({
  baseURL: '',
  paramsSerializer: (params) => Qs.stringify(params, { arrayFormat: 'repeat' }),
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const workspaceId = getGlobalWorkspaceId();
  console.log(workspaceId);
  if (workspaceId) {
    config.headers.set('X-Workspace-Id', workspaceId);
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/**
 * Axios client implementation for Orval-generated API clients
 * Used as the custom client instance for Orval API generation
 */
export const orvalClient = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> & { cancel: () => void } => {
  const source = Axios.CancelToken.source();
  const promise = axiosInstance<T>({
    ...config,
    ...options,
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
