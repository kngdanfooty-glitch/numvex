'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddAdminBody,
  AdminDepositRow,
  AdminMe,
  AdminOrderRow,
  AdminUserDetail,
  AdminUserRow,
  AuditEntry,
  DashboardData,
  FinanceReport,
  OrderKind,
  Paged,
  PricingSettings,
  ServiceSettings,
  TeamMember,
  UpdateAdminBody,
} from '@numvexs/shared';
import { apiFetch } from './api';

/* The admin panel's data. Every call is checked again on the server: the menu hiding things is only a convenience. */

const A = ['admin'] as const;
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Who am I as an admin, and which sections may I open? */
export function useAdminMe() {
  return useQuery({ queryKey: [...A, 'me'], queryFn: () => apiFetch<{ admin: AdminMe }>('/v1/admin/me'), retry: false, staleTime: 60_000 });
}

export function useDashboard() {
  return useQuery({ queryKey: [...A, 'dashboard'], queryFn: () => apiFetch<DashboardData>('/v1/admin/dashboard'), retry: false, refetchInterval: 60_000 });
}

export function useAdminUsers(p: { search?: string; status?: string; page: number }) {
  return useQuery({
    queryKey: [...A, 'users', p],
    queryFn: () => apiFetch<Paged<AdminUserRow>>(`/v1/admin/users${qs({ ...p, limit: 15 })}`),
    retry: false,
    placeholderData: (prev) => prev,
  });
}
export function useAdminUser(id: string) {
  return useQuery({ queryKey: [...A, 'user', id], queryFn: () => apiFetch<{ user: AdminUserDetail }>(`/v1/admin/users/${id}`), retry: false });
}
export function useSuspend(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { suspend: boolean; reason: string }) => apiFetch(`/v1/admin/users/${id}/${v.suspend ? 'suspend' : 'unsuspend'}`, { method: 'POST', body: { reason: v.reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: A }),
  });
}

export function useAdminOrders(p: { kind: OrderKind; status?: string; search?: string; page: number }) {
  return useQuery({
    queryKey: [...A, 'orders', p],
    queryFn: () => apiFetch<Paged<AdminOrderRow>>(`/v1/admin/orders${qs({ ...p, limit: 15 })}`),
    retry: false,
    placeholderData: (prev) => prev,
  });
}
export function useAdminDeposits(p: { status?: string; page: number }) {
  return useQuery({
    queryKey: [...A, 'deposits', p],
    queryFn: () => apiFetch<Paged<AdminDepositRow>>(`/v1/admin/deposits${qs({ ...p, limit: 15 })}`),
    retry: false,
    placeholderData: (prev) => prev,
  });
}

export function useFinance(days: number) {
  return useQuery({ queryKey: [...A, 'finance', days], queryFn: () => apiFetch<FinanceReport>(`/v1/admin/finance?days=${days}`), retry: false });
}

export function usePricing() {
  return useQuery({ queryKey: [...A, 'pricing'], queryFn: () => apiFetch<{ pricing: PricingSettings }>('/v1/admin/pricing'), retry: false });
}
export function useSavePricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pricing: PricingSettings; reason: string }) => apiFetch<{ pricing: PricingSettings }>('/v1/admin/pricing', { method: 'PUT', body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: A }),
  });
}

export interface ServicesView {
  settings: ServiceSettings;
  servers: { numbers: { id: string; label: string }[]; boost: { id: string; label: string }[]; esim: { id: string; label: string }[]; rentals: { id: string; label: string }[] };
}
export function useServices() {
  return useQuery({ queryKey: [...A, 'services'], queryFn: () => apiFetch<ServicesView>('/v1/admin/services'), retry: false });
}
export function useSaveServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { services: ServiceSettings; reason: string }) => apiFetch<ServicesView>('/v1/admin/services', { method: 'PUT', body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: A }),
  });
}

export function useTeam() {
  return useQuery({ queryKey: [...A, 'team'], queryFn: () => apiFetch<{ team: TeamMember[] }>('/v1/admin/team'), retry: false });
}
export function useAddAdmin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: AddAdminBody) => apiFetch('/v1/admin/team', { method: 'POST', body: b }), onSuccess: () => qc.invalidateQueries({ queryKey: A }) });
}
export function useUpdateAdmin(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: UpdateAdminBody) => apiFetch(`/v1/admin/team/${id}`, { method: 'PATCH', body: b }), onSuccess: () => qc.invalidateQueries({ queryKey: A }) });
}
export function useRevokeAdmin(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => apiFetch(`/v1/admin/team/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: A }) });
}

export function useAudit(p: { module?: string; page: number }) {
  return useQuery({
    queryKey: [...A, 'audit', p],
    queryFn: () => apiFetch<Paged<AuditEntry>>(`/v1/admin/audit${qs({ ...p, limit: 30 })}`),
    retry: false,
    placeholderData: (prev) => prev,
  });
}
