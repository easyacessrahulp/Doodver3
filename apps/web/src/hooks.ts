import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, qs } from './api';

export function useList(key: string, path: string, params: Record<string, unknown>, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: [key, params], enabled, initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<{ items: any[]; nextCursor: string | null }>(path + qs({ ...params, limit: 100, cursor: pageParam })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}
export const useCompanies = () => useQuery({ queryKey: ['companies-all'], queryFn: () => api<{ items: any[] }>('/companies?limit=200').then((r) => r.items) });
export const useProjectsOf = (companyId?: string) => useQuery({ queryKey: ['projects-of', companyId], enabled: !!companyId, queryFn: () => api<{ items: any[] }>('/projects' + qs({ companyId, limit: 200 })).then((r) => r.items) });
export const usePeopleOf = (companyId?: string) => useQuery({ queryKey: ['people-of', companyId], enabled: !!companyId, queryFn: () => api<{ items: any[] }>('/people' + qs({ companyId, limit: 200 })).then((r) => r.items) });
export const useAllPeople = () => useQuery({ queryKey: ['people-all'], queryFn: () => api<{ items: any[] }>('/people?all=true&limit=200').then((r) => r.items) });
export const useMessages = (companyId: string) => useQuery({
  queryKey: ['messages', companyId], refetchInterval: 5 * 60_000,
  queryFn: () => api<any>('/messages' + qs({ today: localToday(), companyId })),
});
import { today as localToday } from './api';
