import { useQuery, useQueryClient } from '@tanstack/react-query';

interface UseGlobalStateOptions<T> {
    key: string;
    initial?: T;
}

export function useGlobalState<T = any>({ key, initial }: UseGlobalStateOptions<T>) {
    const queryClient = useQueryClient();
    const queryKey = ['global-state', key];

    const { data: state = initial } = useQuery<T>({
        queryKey,
        queryFn: () => initial as T,
        staleTime: Infinity,
    });

    const setState = (newState: T | ((prev: T) => T)) => {
        const current = queryClient.getQueryData<T>(queryKey) ?? initial;

        const resolvedState = typeof newState === 'function'
            ? (newState as (prev: T) => T)(current as T)
            : newState;

        queryClient.setQueryData(queryKey, resolvedState);
    };

    return { state, setState };
}
