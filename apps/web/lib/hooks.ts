'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthResponse,
  BoostCatalog,
  BoostOrder,
  BoostServerId,
  PlaceBoostOrderBody,
  AdjustWalletBody,
  CreditDepositBody,
  UnmatchedDeposit,
  HistoryPage,
  VirtualAccount,
  WalletDeposit,
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  LoginResponse,
  NumberActivation,
  NumberCatalog,
  NumberQuote,
  EsimCountry,
  EsimOrder,
  EsimPlan,
  EsimServerId,
  ExtendRentalBody,
  NumberServerId,
  PlaceEsimOrderBody,
  PlaceRentalBody,
  Rental,
  RentalCountry,
  RentalOption,
  RentalServerId,
  PlaceTelegramOrderBody,
  ResolveTelegramBody,
  ReviewTelegramOrder,
  TelegramOrder,
  TelegramQuote,
  TelegramQuoteQuery,
  RegisterBody,
  ResendVerificationBody,
  ResetPasswordBody,
  VerifyEmailBody,
  VerifyTwoFactorBody,
} from '@numvexs/shared';
import { apiFetch } from './api';

const ME_KEY = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<AuthResponse>('/v1/auth/me'),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch<LoginResponse>('/v1/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      if ('user' in data) qc.setQueryData(ME_KEY, data);
    },
  });
}

export function useVerifyTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyTwoFactorBody) =>
      apiFetch<AuthResponse>('/v1/auth/2fa/verify', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(ME_KEY, data),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiFetch<AuthResponse>('/v1/auth/register', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(ME_KEY, data), // signed in at once: email verification is off for now
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyEmailBody) =>
      apiFetch<AuthResponse>('/v1/auth/verify-email', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(ME_KEY, data),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (body: ResendVerificationBody) =>
      apiFetch<{ ok: true }>('/v1/auth/resend-verification', { method: 'POST', body }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordBody) =>
      apiFetch<{ ok: true }>('/v1/auth/forgot-password', { method: 'POST', body }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordBody) =>
      apiFetch<{ ok: true }>('/v1/auth/reset-password', { method: 'POST', body }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
    // Whether or not the server call worked, forget everything we cached about the user.
    onSettled: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiFetch<{ ok: true }>('/v1/auth/change-password', { method: 'POST', body }),
  });
}

const CATALOG_TTL = 5 * 60 * 1000; // same 5 minutes FloZap cached for
// Bump the version when the catalogue's shape changes, so a browser never reads an old shape.
const CATALOG_KEY = (server: NumberServerId) => `mhub_catalog_v2_${server}`;

/** A server's list, remembered in this browser so a reload or a return to the tab shows it at once. */
function readCatalog(server: NumberServerId): { at: number; data: NumberCatalog } | undefined {
  try {
    const raw = localStorage.getItem(CATALOG_KEY(server));
    if (!raw) return undefined;
    const hit = JSON.parse(raw) as { at: number; data: NumberCatalog };
    return Date.now() - hit.at < 60 * 60 * 1000 ? hit : undefined; // never show a list older than an hour
  } catch {
    return undefined;
  }
}

/**
 * One server's countries + services. Call it only from that server's panel, so it loads when its tab
 * opens. Cached three ways: in memory (5 min fresh), in localStorage (instant first paint), and the
 * API caches it too.
 */
export function useNumberCatalog(server: NumberServerId) {
  const saved = typeof window === 'undefined' ? undefined : readCatalog(server);
  return useQuery({
    queryKey: ['numbers', 'catalog', server],
    queryFn: async () => {
      const data = await apiFetch<NumberCatalog>(`/v1/numbers/servers/${server}/catalog`);
      try {
        localStorage.setItem(CATALOG_KEY(server), JSON.stringify({ at: Date.now(), data }));
      } catch {}
      return data;
    },
    initialData: saved?.data,
    initialDataUpdatedAt: saved?.at,
    staleTime: CATALOG_TTL,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}

export function useNumberQuote(server: NumberServerId, service: string | null, country?: string) {
  return useQuery({
    queryKey: ['numbers', 'quote', server, service, country ?? ''],
    queryFn: () =>
      apiFetch<NumberQuote>(
        `/v1/numbers/servers/${server}/price?service=${encodeURIComponent(service!)}${country ? `&country=${encodeURIComponent(country)}` : ''}`,
      ),
    enabled: !!service,
    staleTime: 60 * 1000, // prices and stock move, so only a minute
    retry: false,
  });
}

export function useBuyNumber(server: NumberServerId) {
  const qc = useQueryClient();
  return useMutation({
    // `country` for servers whose prices depend on it; `tier` is the price the buyer picked, for servers with several.
    mutationFn: (body: { service: string; country?: string; tier?: string }) =>
      apiFetch<{ activation: NumberActivation }>(`/v1/numbers/servers/${server}/buy`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY }); // the wallet balance just changed
      qc.invalidateQueries({ queryKey: ['numbers', 'orders'] });
    },
  });
}

/** Checks a bought number every 5 seconds until the code arrives or it is cancelled. */
export function useActivation(id: string | null) {
  return useQuery({
    queryKey: ['numbers', 'activation', id],
    queryFn: () => apiFetch<{ activation: NumberActivation }>(`/v1/numbers/activations/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.activation.status === 'pending' ? 5000 : false),
  });
}

export function useCancelNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      // `refused`: the server wouldn't cancel yet (e.g. HeroSMS in the first 2 minutes), so nothing was refunded.
      apiFetch<{ activation: NumberActivation; refused: boolean }>(`/v1/numbers/activations/${id}/cancel`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['numbers', 'activation', data.activation.id], { activation: data.activation });
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ['numbers', 'orders'] });
    },
  });
}

/** The user's bought numbers, newest first. Fetched when the Orders page opens. */
export function useNumberOrders() {
  return useQuery({
    queryKey: ['numbers', 'orders'],
    queryFn: () => apiFetch<{ activations: NumberActivation[] }>('/v1/numbers/activations'),
    retry: false,
  });
}

/** The user pressed "Done": tell the provider we're finished with a number whose code arrived (FloZap's markAsDone). */
export function useMarkNumberDone() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ activation: NumberActivation }>(`/v1/numbers/activations/${id}/done`, { method: 'POST' }),
  });
}

/**
 * One boost server's catalogue (platforms > categories > services), fetched when that server's tab is open: the page
 * shows the first server by default. Kept in memory for 10 minutes (it is big, so it is not saved in localStorage).
 */
export function useBoostCatalog(server: BoostServerId) {
  return useQuery({
    queryKey: ['boost', 'catalog', server],
    queryFn: () => apiFetch<BoostCatalog>(`/v1/boost/servers/${server}/catalog`),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}

/** Place a boost order. The page makes up `requestId` per order form, so a double-click can't charge twice. */
export function usePlaceBoostOrder(server: BoostServerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceBoostOrderBody) =>
      apiFetch<{ order: BoostOrder }>(`/v1/boost/servers/${server}/orders`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY }); // the wallet balance just changed
      qc.invalidateQueries({ queryKey: ['boost', 'orders'] });
    },
  });
}

/** The user's boost orders. Reads our database only (the boost job is what asks the panels); refreshed while any is open. */
export function useBoostOrders() {
  return useQuery({
    queryKey: ['boost', 'orders'],
    queryFn: () => apiFetch<{ orders: BoostOrder[] }>('/v1/boost/orders'),
    refetchInterval: (q) => (q.state.data?.orders.some((o) => o.status === 'pending' || o.status === 'in_progress') ? 30_000 : false),
    retry: false,
  });
}

/* ---------------- Bank-transfer funding ---------------- */

/** My static bank account, or null when I have not made one yet. */
export function useVirtualAccount() {
  return useQuery({
    queryKey: ['wallet', 'account'],
    queryFn: () => apiFetch<{ account: VirtualAccount | null }>('/v1/wallet/account'),
    retry: false,
  });
}

/** Make my account (once). The server returns the same one if it already exists. */
export function useCreateVirtualAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ account: VirtualAccount }>('/v1/wallet/account', { method: 'POST', body: {} }),
    onSuccess: (d) => qc.setQueryData(['wallet', 'account'], { account: d.account }),
  });
}

/** Transfers that reached my wallet. Refreshed now and then, so a payment shows up without reloading. */
export function useDeposits() {
  return useQuery({
    queryKey: ['wallet', 'deposits'],
    queryFn: () => apiFetch<{ deposits: WalletDeposit[] }>('/v1/wallet/deposits'),
    refetchInterval: 30_000,
    retry: false,
  });
}

/* ---------------- Money history ---------------- */

/** Every deposit, purchase and refund, newest first, 30 at a time ("Load more" asks for the next page). */
export function useHistory() {
  return useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => apiFetch<HistoryPage>(`/v1/history?limit=30${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
    retry: false,
  });
}

/* ---------------- eSIMs ---------------- */

/** One eSIM server's countries, fetched when its dropdown entry is shown (the first server, by default). */
export function useEsimCountries(server: EsimServerId) {
  return useQuery({
    queryKey: ['esim', 'countries', server],
    queryFn: () => apiFetch<{ countries: EsimCountry[] }>(`/v1/esim/servers/${server}/countries`),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** The plans for one country on one server, fetched when the country is picked. */
export function useEsimPlans(server: EsimServerId, country: string | null) {
  return useQuery({
    queryKey: ['esim', 'plans', server, country],
    queryFn: () => apiFetch<{ plans: EsimPlan[] }>(`/v1/esim/servers/${server}/plans?country=${encodeURIComponent(country!)}`),
    enabled: !!country,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Buy a plan. The page makes up `requestId` per purchase, so a double-click can't buy two. */
export function usePlaceEsimOrder(server: EsimServerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceEsimOrderBody) => apiFetch<{ order: EsimOrder }>(`/v1/esim/servers/${server}/orders`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY }); // the wallet balance just changed
      qc.invalidateQueries({ queryKey: ['esim', 'orders'] });
    },
  });
}

/** My eSIMs (the list leaves out the install data). */
export function useEsimOrders() {
  return useQuery({
    queryKey: ['esim', 'orders'],
    queryFn: () => apiFetch<{ orders: EsimOrder[] }>('/v1/esim/orders'),
    retry: false,
  });
}

/** One of my eSIMs with its install data (QR). Only asked for when the buyer opens it. */
export function useEsimOrder(id: string | null) {
  return useQuery({
    queryKey: ['esim', 'order', id],
    queryFn: () => apiFetch<{ order: EsimOrder }>(`/v1/esim/orders/${id}`),
    enabled: !!id,
    retry: false,
  });
}

/* ---------------- Number rentals ---------------- */

/** One rental server's countries, fetched when its dropdown entry is shown. */
export function useRentalCountries(server: RentalServerId) {
  return useQuery({
    queryKey: ['rentals', 'countries', server],
    queryFn: () => apiFetch<{ countries: RentalCountry[] }>(`/v1/rentals/servers/${server}/countries`),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** The rental lengths and prices for one country, fetched when the country is picked (or when extending). */
export function useRentalOptions(server: RentalServerId | null, country: string | null) {
  return useQuery({
    queryKey: ['rentals', 'options', server, country],
    queryFn: () => apiFetch<{ options: RentalOption[] }>(`/v1/rentals/servers/${server}/options?country=${encodeURIComponent(country!)}`),
    enabled: !!server && !!country,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Rent a number. The page makes up `requestId` per purchase, so a double-click can't buy two. */
export function useRentNumber(server: RentalServerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceRentalBody) => apiFetch<{ rental: Rental }>(`/v1/rentals/servers/${server}/rentals`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ['rentals', 'mine'] });
    },
  });
}

/** My rentals (the list leaves out the messages). Reads our database only. */
export function useRentals() {
  return useQuery({
    queryKey: ['rentals', 'mine'],
    queryFn: () => apiFetch<{ rentals: Rental[] }>('/v1/rentals/rentals'),
    retry: false,
  });
}

/** One rental with its messages. While it is open the page re-reads our database every 10 seconds; the server job brings the messages in. */
export function useRental(id: string | null) {
  return useQuery({
    queryKey: ['rentals', 'one', id],
    queryFn: () => apiFetch<{ rental: Rental }>(`/v1/rentals/rentals/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.rental.status === 'active' ? 10_000 : false),
    retry: false,
  });
}

/** The Refresh button: ask the server to look for new messages right now. */
export function useRefreshRental(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ rental: Rental }>(`/v1/rentals/rentals/${id}/refresh`, { method: 'POST' }),
    onSuccess: (d) => qc.setQueryData(['rentals', 'one', id], d),
  });
}

export function useExtendRental(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExtendRentalBody) => apiFetch<{ rental: Rental }>(`/v1/rentals/rentals/${id}/extend`, { method: 'POST', body }),
    onSuccess: (d) => {
      qc.setQueryData(['rentals', 'one', id], d);
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ['rentals', 'mine'] });
    },
  });
}

/* ---------------- Telegram Premium & Stars ---------------- */

/** Who a username is and what the order costs. Asked for when the buyer taps "Check username"; nothing is charged. */
export function useTelegramQuote() {
  return useMutation({
    mutationFn: (q: TelegramQuoteQuery) =>
      apiFetch<{ quote: TelegramQuote }>(`/v1/telegram/quote?service=${q.service}&units=${q.units}&username=${encodeURIComponent(q.username)}`),
  });
}

/** Buy. The page makes up `requestId` per purchase, so a double-click can't buy two. */
export function usePlaceTelegramOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceTelegramOrderBody) => apiFetch<{ order: TelegramOrder }>('/v1/telegram/orders', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY }); // the wallet balance just changed
      qc.invalidateQueries({ queryKey: ['telegram', 'orders'] });
    },
  });
}

/** My Telegram orders. Reads our database only (the telegram job asks the supplier); refreshed while any is open. */
export function useTelegramOrders() {
  return useQuery({
    queryKey: ['telegram', 'orders'],
    queryFn: () => apiFetch<{ orders: TelegramOrder[] }>('/v1/telegram/orders'),
    refetchInterval: (q) => (q.state.data?.orders.some((o) => o.status === 'processing' || o.status === 'placing') ? 30_000 : false),
    retry: false,
  });
}

/* ---------------- Admin ---------------- */

const ADMIN_KEY = ['admin'] as const;

export function useUnmatchedDeposits() {
  return useQuery({ queryKey: [...ADMIN_KEY, 'deposits'], queryFn: () => apiFetch<{ deposits: UnmatchedDeposit[] }>('/v1/admin/deposits/unmatched'), retry: false });
}

export function useReviewTelegram() {
  return useQuery({ queryKey: [...ADMIN_KEY, 'telegram'], queryFn: () => apiFetch<{ orders: ReviewTelegramOrder[] }>('/v1/admin/telegram/review'), retry: false });
}

/** After any admin action: the lists and the log are out of date. */
function useAdminDone() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ADMIN_KEY });
}

export function useCreditDeposit() {
  const done = useAdminDone();
  return useMutation({
    mutationFn: (v: { id: string } & CreditDepositBody) => apiFetch(`/v1/admin/deposits/${v.id}/credit`, { method: 'POST', body: { user: v.user, reason: v.reason } }),
    onSuccess: done,
  });
}
export function useResolveTelegram() {
  const done = useAdminDone();
  return useMutation({
    mutationFn: (v: { id: string } & ResolveTelegramBody) => apiFetch(`/v1/admin/telegram/${v.id}/resolve`, { method: 'POST', body: { outcome: v.outcome, reason: v.reason } }),
    onSuccess: done,
  });
}
export function useAdjustWallet() {
  const done = useAdminDone();
  return useMutation({
    mutationFn: (body: AdjustWalletBody) => apiFetch<{ user: string; balanceKobo: number }>('/v1/admin/wallet/adjust', { method: 'POST', body }),
    onSuccess: done,
  });
}
