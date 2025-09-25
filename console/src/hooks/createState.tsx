import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

type Updater<T> = T | ((prev: T) => T);
type ReducerMap<T> = {
  [key: string]: (state: T, ...args: unknown[]) => T;
};
type UseGlobalStateReturn<T, R extends ReducerMap<T>> = {
  state: T;
  setState: (updater: Updater<T>) => void;
} & {
  [K in keyof R]: (
    ...args: Parameters<R[K]> extends [T, ...infer A] ? A : never
  ) => void;
};

export default function createState<T>(
  key: string,
  initialValue: T,
  reducers?: ReducerMap<T>,
): () => UseGlobalStateReturn<T, ReducerMap<T>> {
  return function useGlobalState() {
    const queryClient = useQueryClient();

    const { data: state = initialValue } = useQuery<T>({
      queryKey: ['global', key],
      queryFn: () => initialValue,
      staleTime: Infinity,
    });

    const setState = useCallback(
      (updater: Updater<T>) => {
        queryClient.setQueryData(['global', key], (prev: T | undefined) => {
          const prevValue = prev === undefined ? initialValue : prev;
          return typeof updater === 'function'
            ? (updater as (prev: T) => T)(prevValue)
            : updater;
        });
      },
      [queryClient],
    );

    const actions = (
      Object.entries(reducers || {}) as [
        keyof ReducerMap<T>,
        ReducerMap<T>[keyof ReducerMap<T>],
      ][]
    ).reduce(
      (acc, [name, fn]) => {
        acc[name] = (...args: Parameters<ReducerMap<T>[keyof ReducerMap<T>]>) =>
          setState((prev) => fn(prev, ...args));
        return acc;
      },
      {} as Record<
        keyof ReducerMap<T>,
        (...args: Parameters<ReducerMap<T>[keyof ReducerMap<T>]>) => void
      >,
    );

    return { state, setState, ...actions } as UseGlobalStateReturn<
      T,
      ReducerMap<T>
    >;
  };
}
