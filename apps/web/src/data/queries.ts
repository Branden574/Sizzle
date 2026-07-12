import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { AdminAppealDTO, AdminContentReportDTO, AdminLogDTO, AdminReportGroupDTO, AdminStats, AdminUserDTO, CollectionDTO, CommentDTO, ConversationDTO, CookProfile, CookSummary, CreateRecipeInput, CreatorAnalytics, DirectUploadTicket, DraftCard, EarningsSummary, FeedResponse, MeProfile, MessageDTO, MonetizationStatus, NotificationDTO, NotifPrefKey, PostControls, ProductDTO, RecipeCard, RecipeDetail, ReportInput, SearchResults, SuggestedCook, SupportRequestDTO, ThreadDTO, TierDTO, TipConfig, TrendingTag, VerificationTier, VideoAssetStatus, VideoUploadConfig } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useSizzle } from '../store';
import { apiGet, apiSend } from '../lib/api';
import { removeOffline, saveOffline } from '../lib/offline';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/* ─────────────────────────── query keys ─────────────────────────── */
export const keys = {
  me: ['me'] as const,
  forYou: ['feed', 'foryou'] as const,
  following: ['feed', 'following'] as const,
  saved: ['saved'] as const,
  recipe: (id: string) => ['recipe', id] as const,
  cook: (id: string) => ['cook', id] as const,
  collections: ['collections'] as const,
  collection: (id: string) => ['collection', id] as const,
};

/* ─────────────────────────── queries ────────────────────────────── */
export function useMe() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: keys.me, queryFn: () => apiGet<MeProfile>('/me'), enabled: authed });
}

/** Creator insights (own profile). */
export function useAnalytics(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'analytics'], queryFn: () => apiGet<CreatorAnalytics>('/me/analytics'), enabled });
}

/* ─────────────────────────── monetization ─────────────────────────── */

/** Tip flow config (provider, fee %, presets). Rarely changes — cache long. */
export function useTipConfig(enabled: boolean) {
  return useQuery({ queryKey: ['monetize', 'config'], queryFn: () => apiGet<TipConfig>('/monetize/config'), enabled, staleTime: 3_600_000 });
}

/** After sending the user to an external checkout (Stripe) in a new tab, refresh
 *  the affected queries once they return to the app — so a freshly unlocked recipe
 *  or new subscription stops showing as locked without a manual reload. One-shot. */
function invalidateOnReturn(qc: QueryClient, queryKeys: readonly (readonly unknown[])[]) {
  const handler = () => {
    if (document.visibilityState !== 'visible') return;
    for (const key of queryKeys) void qc.invalidateQueries({ queryKey: key });
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('focus', handler);
  };
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('focus', handler);
}

/** Send a tip. Stripe → returns a checkout URL to open; mock → settles instantly. */
export function useSendTip() {
  return useMutation({
    mutationFn: (v: { creatorId: string; recipeId?: string; amountCents: number }) =>
      apiSend<{ url: string | null; status: 'pending' | 'succeeded' }>('POST', '/monetize/tip', v),
  });
}

/** The creator's earnings ledger (totals + recent tips, fee split explicit). */
export function useEarnings(enabled: boolean) {
  return useQuery({ queryKey: ['monetize', 'earnings'], queryFn: () => apiGet<EarningsSummary>('/monetize/earnings'), enabled });
}

/** Payout status; polls while pending so finishing Stripe onboarding flips the UI. */
export function useMonetizationStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['monetize', 'status'],
    queryFn: () => apiGet<{ status: MonetizationStatus }>('/monetize/status'),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 8000 : false),
  });
}

/** Start payout onboarding (Stripe link, or instant in test mode). */
export function useStartOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ url: string | null; status: MonetizationStatus }>('POST', '/monetize/onboard'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['monetize'] });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Unlock a premium recipe (opens Stripe checkout, or settles instantly in test mode). */
export function useUnlockRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiSend<{ url: string | null; status: string }>('POST', '/monetize/unlock', { recipeId }),
    onSuccess: (res, recipeId) => {
      if (res.url) {
        window.open(res.url, '_blank', 'noopener');
        invalidateOnReturn(qc, [keys.recipe(recipeId), ['feed'], ['cook']]);
      } else {
        void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
        void qc.invalidateQueries({ queryKey: ['feed'] });
        void qc.invalidateQueries({ queryKey: ['cook'] });
      }
    },
  });
}

/** A creator's public subscription tiers (empty = single flat price). */
export function useCookTiers(cookId: string | null) {
  return useQuery({ queryKey: ['cook', cookId, 'tiers'], queryFn: () => apiGet<TierDTO[]>(`/cooks/${cookId}/tiers`), enabled: !!cookId });
}

/** The creator's own subscription tiers. */
export function useMyTiers(enabled: boolean) {
  return useQuery({ queryKey: ['monetize', 'tiers'], queryFn: () => apiGet<{ tiers: TierDTO[] }>('/monetize/tiers'), enabled });
}

/** Create a subscription tier. */
export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; priceCents: number; perks?: string | null }) => apiSend('POST', '/monetize/tiers', v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['monetize', 'tiers'] }); void qc.invalidateQueries({ queryKey: ['cook'] }); },
  });
}

/** Delete a subscription tier. */
export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/monetize/tiers/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['monetize', 'tiers'] }); void qc.invalidateQueries({ queryKey: ['cook'] }); },
  });
}

/** Subscribe to a creator (opens Stripe checkout, or activates instantly in test mode). */
export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ creatorId, tierId }: { creatorId: string; tierId?: string }) => apiSend<{ url: string | null; status: string }>('POST', '/monetize/subscribe', { creatorId, tierId }),
    onSuccess: (res, { creatorId }) => {
      if (res.url) {
        window.open(res.url, '_blank', 'noopener');
        invalidateOnReturn(qc, [keys.cook(creatorId), ['feed'], ['recipe']]);
      } else {
        void qc.invalidateQueries({ queryKey: keys.cook(creatorId) });
        void qc.invalidateQueries({ queryKey: ['feed'] });
        void qc.invalidateQueries({ queryKey: ['recipe'] });
      }
    },
  });
}

/** Cancel a creator subscription (at period end). */
export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creatorId: string) => apiSend('POST', '/monetize/subscribe/cancel', { creatorId }),
    onSuccess: (_d, creatorId) => void qc.invalidateQueries({ queryKey: keys.cook(creatorId) }),
  });
}

/** Set (or clear) the creator's own monthly subscription price. */
export function useSetSubPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (priceCents: number | null) => apiSend('POST', '/monetize/sub-price', { priceCents }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monetize'] }),
  });
}

/** Set (or clear) the creator's funding goal. */
export function useSetGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { label: string | null; targetCents: number | null }) => apiSend('POST', '/monetize/goal', v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['monetize'] }); void qc.invalidateQueries({ queryKey: ['cook'] }); },
  });
}

/** The creator's own digital products. */
export function useMyProducts(enabled: boolean) {
  return useQuery({ queryKey: ['monetize', 'products'], queryFn: () => apiGet<{ products: ProductDTO[] }>('/monetize/products'), enabled });
}

/** A creator's public digital products (with an `owned` flag for the viewer). */
export function useCookProducts(cookId: string | null) {
  return useQuery({ queryKey: ['cook', cookId, 'products'], queryFn: () => apiGet<ProductDTO[]>(`/cooks/${cookId}/products`), enabled: !!cookId });
}

/** Create a digital product. */
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; description?: string | null; priceCents: number; fileUrl?: string | null }) => apiSend('POST', '/monetize/products', v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monetize', 'products'] }),
  });
}

/** Delete (deactivate) a digital product. */
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/monetize/products/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monetize', 'products'] }),
  });
}

/** Buy a creator's digital product (Stripe checkout, or instant in test mode). */
export function useBuyProduct(cookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => apiSend<{ url: string | null; status: string }>('POST', `/monetize/products/${productId}/buy`, {}),
    onSuccess: (res) => {
      if (res.url) { window.open(res.url, '_blank', 'noopener'); invalidateOnReturn(qc, [['cook', cookId, 'products']]); }
      else void qc.invalidateQueries({ queryKey: ['cook', cookId, 'products'] });
    },
  });
}

/** Start a live cooking session (mock playback until Cloudflare Stream Live is keyed). */
export function useStartLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => apiSend<{ id: string; playbackUrl: string | null; provider: string }>('POST', '/live/start', { title }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['live'] }),
  });
}

/** End your current live session. */
export function useEndLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', '/live/end', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['live'] }),
  });
}

/** A creator's current live session, or null. */
export function useCookLive(cookId: string | null) {
  return useQuery({
    queryKey: ['live', cookId],
    queryFn: () => apiGet<{ id: string; title: string; playbackUrl: string | null; viewers: number; startedAt: string } | null>(`/live/${cookId}`),
    enabled: !!cookId,
    refetchInterval: 20_000,
  });
}

/** Self-serve verification — auto-grants at follower thresholds. */
export function useRequestVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ granted: boolean; tier: string | null; message?: string }>('POST', '/me/verify', {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: keys.me }); void qc.invalidateQueries({ queryKey: ['cook'] }); },
  });
}

/** Payout balance + next payout date + dashboard link. */
export function usePayout(enabled: boolean) {
  return useQuery({
    queryKey: ['monetize', 'payout'],
    queryFn: () => apiGet<{ provider: string; availableCents: number; pendingCents: number; nextPayoutDate: string; dashboardUrl: string | null; taxNote: string }>('/monetize/payout'),
    enabled,
  });
}

/** Broadcast one DM to all of the creator's active subscribers. */
export function useBroadcast() {
  return useMutation({
    mutationFn: (text: string) => apiSend<{ ok: boolean; sent: number }>('POST', '/monetize/broadcast', { text }),
  });
}

/** Set (or clear) the auto welcome DM sent to new subscribers. */
export function useSetWelcomeDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string | null) => apiSend('POST', '/monetize/welcome', { text }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monetize'] }),
  });
}

/** Set (or clear) a premium price on the creator's own recipe. */
export function useSetRecipePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, priceCents }: { recipeId: string; priceCents: number | null }) =>
      apiSend('PATCH', `/recipes/${recipeId}/controls`, { priceCents }),
    onSuccess: (_d, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Set a custom cover still for the creator's own video post. */
export function useSetRecipePoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, posterUrl }: { recipeId: string; posterUrl: string }) =>
      apiSend('PATCH', `/recipes/${recipeId}/poster`, { posterUrl }),
    onSuccess: (_d, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Make the creator's own recipe subscribers-only, or public again. */
export function useSetRecipeVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, visibility }: { recipeId: string; visibility: 'public' | 'subscribers' }) =>
      apiSend('PATCH', `/recipes/${recipeId}/controls`, { visibility }),
    onSuccess: (_d, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Toggle a single push category (likes / comments / follows / reposts / messages). */
export function useUpdateNotifPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: NotifPrefKey; enabled: boolean }) => apiSend('POST', '/me/notif-prefs', v),
    onMutate: ({ key, enabled }) => {
      qc.setQueryData<MeProfile>(keys.me, (old) => (old ? { ...old, notifPrefs: { ...old.notifPrefs, [key]: enabled } } : old));
    },
    onError: () => void qc.invalidateQueries({ queryKey: keys.me }),
  });
}

const feedPage = (path: string) => (cursor: string | null) =>
  apiGet<FeedResponse>(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);

export function useForYouFeed() {
  const load = feedPage('/feed/for-you');
  return useInfiniteQuery({
    queryKey: keys.forYou,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useFollowingFeed() {
  const authed = useAuth((s) => s.status === 'authed');
  const load = feedPage('/feed/following');
  return useInfiniteQuery({
    queryKey: keys.following,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: authed,
  });
}

export function useSavedFeed() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: keys.saved, queryFn: () => apiGet<FeedResponse>('/me/saved'), enabled: authed });
}

export function useLikedFeed() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: ['me', 'liked'], queryFn: () => apiGet<FeedResponse>('/me/liked'), enabled: authed });
}

export function useRecipe(id: string | null) {
  return useQuery({ queryKey: keys.recipe(id ?? ''), queryFn: () => apiGet<RecipeDetail>(`/recipes/${id}`), enabled: !!id });
}

export function useCook(id: string | null) {
  return useQuery({ queryKey: keys.cook(id ?? ''), queryFn: () => apiGet<CookProfile>(`/cooks/${id}`), enabled: !!id });
}

export function useFollowList(id: string | null, mode: 'followers' | 'following') {
  return useQuery({
    queryKey: ['follow-list', id, mode],
    queryFn: () => apiGet<CookSummary[]>(`/cooks/${id}/${mode}`),
    enabled: !!id,
  });
}

export function useComments(recipeId: string | null) {
  return useQuery({
    queryKey: ['comments', recipeId],
    queryFn: () => apiGet<CommentDTO[]>(`/recipes/${recipeId}/comments`),
    enabled: !!recipeId,
    // Comments should feel live: refetch every time the sheet opens so a viewer
    // always sees the latest (others' new comments aren't pushed in real time).
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useAddComment(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { text: string; parentId?: string }) => {
      const body = typeof input === 'string' ? { text: input } : input;
      return apiSend<CommentDTO>('POST', `/recipes/${recipeId}/comments`, body);
    },
    onSuccess: (created) => {
      qc.setQueryData<CommentDTO[]>(['comments', recipeId], (old) => {
        if (!old) return [created];
        if (!created.parentId) return [{ ...created, replies: [] }, ...old];
        // A reply: nest it under its parent and bump the parent's replyCount.
        return old.map((c) =>
          c.id === created.parentId
            ? { ...c, replyCount: c.replyCount + 1, replies: [...(c.replies ?? []), created] }
            : c,
        );
      });
      void qc.invalidateQueries({ queryKey: ['feed'] }); // comment_count
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/** Toggle a like on a single comment (optimistic, updates top-level + nested replies). */
export function useToggleCommentLike(recipeId: string) {
  const qc = useQueryClient();
  const key = ['comments', recipeId] as const;
  return useMutation({
    mutationFn: (commentId: string) => apiSend<{ liked: boolean; likes: number }>('POST', `/recipes/${recipeId}/comments/${commentId}/like`),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<CommentDTO[]>(key);
      const flip = (c: CommentDTO): CommentDTO =>
        c.id === commentId ? { ...c, likedByMe: !c.likedByMe, likes: Math.max(0, c.likes + (c.likedByMe ? -1 : 1)) } : c;
      qc.setQueryData<CommentDTO[]>(key, (old) =>
        old?.map((c) => ({ ...flip(c), replies: c.replies?.map(flip) })),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: ({ liked, likes }, commentId) => {
      // Reconcile to the server's authoritative count.
      const set = (c: CommentDTO): CommentDTO => (c.id === commentId ? { ...c, likedByMe: liked, likes } : c);
      qc.setQueryData<CommentDTO[]>(key, (old) => old?.map((c) => ({ ...set(c), replies: c.replies?.map(set) })));
    },
  });
}

/** Delete a comment (own comment, or any comment on a recipe you own). Optimistically
 *  removes it from the open thread, then refreshes the comment counter. */
export function useDeleteComment(recipeId: string) {
  const qc = useQueryClient();
  const key = ['comments', recipeId] as const;
  return useMutation({
    mutationFn: (commentId: string) => apiSend('DELETE', `/recipes/${recipeId}/comments/${commentId}`),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<CommentDTO[]>(key, (old) =>
        (old ?? [])
          // Drop a deleted top-level comment outright; otherwise prune it from replies.
          .filter((c) => c.id !== commentId)
          .map((c) =>
            c.replies?.some((r) => r.id === commentId)
              ? { ...c, replyCount: Math.max(0, c.replyCount - 1), replies: c.replies.filter((r) => r.id !== commentId) }
              : c,
          ),
      );
    },
    // Each removal is independent, so overlapping deletes are safe; on failure we
    // reconcile from the server rather than rolling back a shared snapshot.
    onError: () => void qc.invalidateQueries({ queryKey: key }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] }); // comment_count
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/** Owner/admin moderation: hide or unhide a comment on your own recipe (optimistic). */
export function useHideComment(recipeId: string) {
  const qc = useQueryClient();
  const key = ['comments', recipeId] as const;
  return useMutation({
    mutationFn: ({ commentId, hidden }: { commentId: string; hidden: boolean }) =>
      apiSend('POST', `/recipes/${recipeId}/comments/${commentId}/hide`, { hidden }),
    onMutate: async ({ commentId, hidden }) => {
      await qc.cancelQueries({ queryKey: key });
      const flip = (c: CommentDTO): CommentDTO => (c.id === commentId ? { ...c, hidden } : c);
      qc.setQueryData<CommentDTO[]>(key, (old) => old?.map((c) => ({ ...flip(c), replies: c.replies?.map(flip) })));
    },
    // Each flip is independent, so overlapping moderations are safe; on failure we
    // reconcile from the server rather than rolling back a shared snapshot.
    onError: () => void qc.invalidateQueries({ queryKey: key }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/** Report any user-generated target (recipe / comment / profile). */
export function useReport() {
  return useMutation({
    mutationFn: (input: ReportInput) => apiSend('POST', '/reports', input),
  });
}

/** Repost / un-repost a recipe (optimistic on the card). */
export function useToggleRepost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, reposted, comment }: { recipeId: string; reposted: boolean; comment?: string }) =>
      reposted ? apiSend('DELETE', `/recipes/${recipeId}/repost`) : apiSend('POST', `/recipes/${recipeId}/repost`, { comment }),
    onMutate: async ({ recipeId, reposted }) => {
      // Cancel only the point-queries we patch — NOT the infinite ['feed'] query,
      // whose in-flight next-page fetch would otherwise be aborted (stalling
      // scroll) and whose optimistic patch self-heals via onSettled invalidation.
      await Promise.all([
        qc.cancelQueries({ queryKey: keys.recipe(recipeId) }),
        qc.cancelQueries({ queryKey: ['cook'] }),
      ]);
      const snap = snapshot(qc);
      patchRecipeEverywhere(qc, recipeId, (card) => ({ ...card, viewer: { ...card.viewer, reposted: !reposted } }));
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: (_data, _err, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/** Delete one of your own posts (admins can delete anyone's). Clears it everywhere. */
export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiSend('DELETE', `/recipes/${recipeId}`),
    onSuccess: (_d, recipeId) => {
      qc.removeQueries({ queryKey: keys.recipe(recipeId) });
      removeOffline(recipeId);
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: ['me', 'liked'] });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Edit a published post's text (owner/admin). Video is immutable. */
export type EditRecipeInput = {
  recipeId: string;
  title: string;
  cuisine: string;
  level: string;
  timeMinutes: number;
  servings: number;
  caption?: string;
  ingredients: string[];
  steps: string[];
  rating?: number;
};
export function useEditRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, ...input }: EditRecipeInput) => apiSend<RecipeDetail>('PATCH', `/recipes/${recipeId}`, input),
    onSuccess: (_d, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: ['me', 'liked'] });
    },
  });
}

/** Owner appeals a removed video. */
export function useAppealRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, text }: { recipeId: string; text: string }) => apiSend('POST', `/recipes/${recipeId}/appeal`, { text }),
    onSuccess: (_d, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/** Banned user appeals their ban. */
export function useBanAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiSend('POST', '/me/ban-appeal', { text }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/* ─────────────────────────── admin ─────────────────────────── */
export function useAdminStats(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'stats'], queryFn: () => apiGet<AdminStats>('/admin/stats'), enabled });
}
export function useAdminReports(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'reports'], queryFn: () => apiGet<AdminReportGroupDTO[]>('/admin/reports'), enabled });
}
export function useAdminAppeals(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'appeals'], queryFn: () => apiGet<AdminAppealDTO[]>('/admin/appeals'), enabled });
}
export function useAdminContentReports(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'content-reports'], queryFn: () => apiGet<AdminContentReportDTO[]>('/admin/content-reports'), enabled });
}
export function useAdminLog(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'log'], queryFn: () => apiGet<AdminLogDTO[]>('/admin/log'), enabled });
}
export function useAdminUsers(filter: 'all' | 'flagged' | 'banned', q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users', filter, q.trim()],
    queryFn: () => apiGet<AdminUserDTO[]>(`/admin/users?filter=${filter}&q=${encodeURIComponent(q.trim())}`),
    enabled,
  });
}
export function useAdminSupportRequests(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'support'], queryFn: () => apiGet<SupportRequestDTO[]>('/admin/support-requests'), enabled });
}
export const useResolveSupportRequest = adminMutation<{ id: string }>(({ id }) => apiSend('POST', `/admin/support-requests/${id}/resolve`));
function adminMutation<V>(fn: (v: V) => Promise<unknown>) {
  return function useAdminMutation() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fn,
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['admin'] });
        void qc.invalidateQueries({ queryKey: ['feed'] });
        void qc.invalidateQueries({ queryKey: ['cook'] });
      },
    });
  };
}
export const useMarkFalseReport = adminMutation<{ recipeId: string }>(({ recipeId }) => apiSend('POST', `/admin/reports/${recipeId}/false`));
export const useRemoveRecipe = adminMutation<{ recipeId: string; reason?: string }>(({ recipeId, reason }) => apiSend('POST', `/admin/recipes/${recipeId}/remove`, { reason }));
export const useRestoreRecipe = adminMutation<{ recipeId: string }>(({ recipeId }) => apiSend('POST', `/admin/recipes/${recipeId}/restore`));
export const useDenyAppeal = adminMutation<{ recipeId: string }>(({ recipeId }) => apiSend('POST', `/admin/recipes/${recipeId}/deny-appeal`));
export const useResolveContentReport = adminMutation<{ targetType: 'comment' | 'profile'; targetId: string; action: 'dismiss' | 'hide' }>((v) => apiSend('POST', '/admin/content-reports/resolve', v));
export const usePurgeAccounts = adminMutation<void>(() => apiSend<{ purged: number }>('POST', '/admin/purge'));
export function useVerifyUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: VerificationTier | null }) => apiSend('POST', `/admin/users/${id}/verify`, { tier }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      // Refresh the signed-in profile too, so verifying yourself updates your
      // own badge immediately (the admin can grant their own check).
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}
export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, banned, reason }: { id: string; banned: boolean; reason?: string }) => apiSend('POST', `/admin/users/${id}/ban`, { banned, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
/** Admin: set a creator's For You ranking boost (0 = none, 0.5 = light, 1 = strong). */
export const useBoostUser = adminMutation<{ id: string; boost: number }>(({ id, boost }) => apiSend('POST', `/admin/users/${id}/boost`, { boost }));

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q.trim()],
    queryFn: () => apiGet<SearchResults>(`/search?q=${encodeURIComponent(q.trim())}`),
    enabled: q.trim().length > 0,
  });
}

export function useHashtagFeed(tag: string | null) {
  return useQuery({
    queryKey: ['tag', tag],
    queryFn: () => apiGet<FeedResponse>(`/feed/tag/${encodeURIComponent(tag ?? '')}`),
    enabled: !!tag,
  });
}

export function useTrendingTags() {
  return useQuery({ queryKey: ['trending-tags'], queryFn: () => apiGet<TrendingTag[]>('/feed/trending-tags') });
}

export function useNotifications() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<NotificationDTO[]>('/me/notifications'),
    enabled: authed,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', '/me/notifications/read'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName?: string; handle?: string; bio?: string; phone?: string; avatarUrl?: string | null; bannerUrl?: string | null; links?: Record<string, string | null> }) =>
      apiSend('PATCH', '/me', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Onboarding creator recommendations — the platform's top 5 cooks by following. */
export function useSuggestedCooks(tastes: string[]) {
  const sorted = [...tastes].sort();
  return useQuery({
    queryKey: ['cooks', 'suggested', sorted],
    queryFn: () => apiGet<SuggestedCook[]>(`/cooks/suggested?tastes=${encodeURIComponent(sorted.join(','))}&limit=5`),
  });
}

/** Creator post controls — persisted server-side + optimistically reflected on every card. */
export function useUpdatePostControls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PostControls> }) =>
      apiSend('PATCH', `/recipes/${id}/controls`, patch),
    onMutate: ({ id, patch }) => {
      patchRecipeEverywhere(qc, id, (c) => ({ ...c, controls: { ...c.controls, ...patch } }));
    },
    onError: (_e, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.recipe(id) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/* ───────────────────── optimistic cache helpers ─────────────────── */

type CardPatch = (card: RecipeCard) => RecipeCard;

/** Map every card in the feed caches: for-you/following are infinite ({pages:[{items}]}), saved is a single flat page. */
function mapFeedCaches(qc: QueryClient, mapper: CardPatch) {
  for (const key of [keys.forYou, keys.following]) {
    qc.setQueryData<InfiniteData<FeedResponse, string | null>>(key, (old) =>
      old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map(mapper) })) } : old,
    );
  }
  qc.setQueryData<FeedResponse>(keys.saved, (old) => (old ? { ...old, items: old.items.map(mapper) } : old));
}

/** Apply a patch to a recipe everywhere it appears in the cache (feeds, saved, detail, cook grids). */
function patchRecipeEverywhere(qc: QueryClient, recipeId: string, patch: CardPatch) {
  mapFeedCaches(qc, (it) => (it.id === recipeId ? patch(it) : it));
  qc.setQueryData<RecipeDetail>(keys.recipe(recipeId), (old) => (old ? (patch(old) as RecipeDetail) : old));
  for (const [key, data] of qc.getQueriesData<CookProfile>({ queryKey: ['cook'] })) {
    if (data?.recipes.some((r) => r.id === recipeId)) {
      qc.setQueryData<CookProfile>(key, { ...data, recipes: data.recipes.map((r) => (r.id === recipeId ? patch(r) : r)) });
    }
  }
  // Also patch the full-screen viewer's snapshot (it renders from zustand, not the query cache).
  useSizzle.getState().patchViewer((c) => (c.id === recipeId ? patch(c) : c));
}

/** Apply a follow-state change to every card by a cook + that cook's profile. */
function patchCookEverywhere(qc: QueryClient, cookId: string, following: boolean) {
  const cardFix = (it: RecipeCard) =>
    it.cook.id === cookId ? { ...it, viewer: { ...it.viewer, following } } : it;
  mapFeedCaches(qc, cardFix);
  qc.setQueryData<CookProfile>(keys.cook(cookId), (old) => (old ? { ...old, viewer: { ...old.viewer, following } } : old));
  useSizzle.getState().patchViewer((it) => (it.cook.id === cookId ? { ...it, viewer: { ...it.viewer, following } } : it));
}

function snapshot(qc: QueryClient) {
  return qc.getQueriesData({});
}
function restore(qc: QueryClient, snap: ReturnType<typeof snapshot>) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

const likePatch: CardPatch = (c) => {
  const liked = !c.viewer.liked;
  const wasDisliked = c.viewer.disliked;
  return {
    ...c,
    viewer: { ...c.viewer, liked, disliked: false },
    counts: {
      ...c.counts,
      likes: c.counts.likes + (liked ? 1 : -1),
      dislikes: c.counts.dislikes - (wasDisliked ? 1 : 0),
    },
  };
};

const dislikePatch: CardPatch = (c) => {
  const disliked = !c.viewer.disliked;
  const wasLiked = c.viewer.liked;
  return {
    ...c,
    viewer: { ...c.viewer, disliked, liked: false },
    counts: {
      ...c.counts,
      dislikes: c.counts.dislikes + (disliked ? 1 : -1),
      likes: c.counts.likes - (wasLiked ? 1 : 0),
    },
  };
};

const savePatch: CardPatch = (c) => ({
  ...c,
  viewer: { ...c.viewer, saved: !c.viewer.saved },
  counts: { ...c.counts, saves: Math.max(0, c.counts.saves + (c.viewer.saved ? -1 : 1)) },
});

/* ─────────────────────────── mutations ──────────────────────────── */

function useRecipeAction(action: 'like' | 'dislike' | 'save', patch: CardPatch) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiSend(`POST`, `/recipes/${recipeId}/${action}`),
    onMutate: async (recipeId: string) => {
      // Only pause the feed queries we're about to patch — cancelling ALL queries
      // aborted unrelated in-flight fetches (e.g. pagination) for no reason.
      await qc.cancelQueries({ queryKey: ['feed'] });
      const snap = snapshot(qc);
      patchRecipeEverywhere(qc, recipeId, patch);
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSuccess: () => {
      // The optimistic patch is authoritative — do NOT invalidate ['feed'] on a
      // like/dislike. That refetched + re-ranked the feed and tore down the video
      // the user was watching. Only a save changes the saved LIST + profile count.
      if (action === 'save') {
        void qc.invalidateQueries({ queryKey: keys.saved });
        void qc.invalidateQueries({ queryKey: keys.me });
      }
    },
  });
}

export const useToggleLike = () => useRecipeAction('like', likePatch);
export const useToggleDislike = () => useRecipeAction('dislike', dislikePatch);
export const useToggleSave = () => useRecipeAction('save', savePatch);

/** Record a share (bumps the share counter). Fire-and-forget with an optimistic +1. */
export function useShareRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiSend('POST', `/recipes/${recipeId}/share`),
    onMutate: (recipeId: string) => {
      const snap = snapshot(qc);
      patchRecipeEverywhere(qc, recipeId, (c) => ({ ...c, counts: { ...c.counts, shares: c.counts.shares + 1 } }));
      return { snap };
    },
    // Roll back the optimistic bump if the share POST fails, then reconcile to the
    // server's authoritative count.
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: (_d, _e, recipeId) => void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) }),
  });
}

/** Toggle offline download. Pass the *current* downloaded state to pick the verb. */
export function useToggleDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, downloaded }: { recipeId: string; downloaded: boolean }) =>
      apiSend(downloaded ? 'DELETE' : 'POST', `/recipes/${recipeId}/download`),
    onMutate: async ({ recipeId, downloaded }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: keys.recipe(recipeId) }),
        qc.cancelQueries({ queryKey: ['cook'] }),
        qc.cancelQueries({ queryKey: keys.saved }),
      ]);
      const snap = snapshot(qc);
      patchRecipeEverywhere(qc, recipeId, (card) => ({ ...card, viewer: { ...card.viewer, downloaded: !downloaded } }));
      const detail = qc.getQueryData<RecipeDetail>(keys.recipe(recipeId));
      if (!downloaded && detail) saveOffline(detail);
      else if (downloaded) removeOffline(recipeId);
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: (_data, _err, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

/**
 * Upload a recipe: request a direct upload ticket, then create the recipe.
 * (With the mock provider the asset is ready immediately, so the byte upload
 * step is a no-op; the real Cloudflare flow PUTs to `ticket.uploadUrl`.)
 */
export type UploadRecipeInput = Omit<CreateRecipeInput, 'videoAssetId'> & {
  /** When the user picked a clip, the storage URL (+ optional poster/duration) it was uploaded to. */
  video?: { uploadedUrl: string; posterUrl?: string; durationSeconds?: number };
  /** Cloudflare flow: the asset id the client already registered + uploaded to. */
  videoAssetId?: string;
};

/** Which upload flow to use (Cloudflare vs Supabase), driven by the API env. */
export function useVideoConfig() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({
    queryKey: ['video-config'],
    queryFn: () => apiGet<VideoUploadConfig>('/uploads/config'),
    enabled: authed,
    staleTime: Infinity,
  });
}

/** Poll a Cloudflare asset until it finishes transcoding (or give up). */
export async function pollVideoReady(assetId: string, tries = 60, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const s = await apiGet<VideoAssetStatus>(`/uploads/video/${assetId}/status`);
      if (s.status === 'ready') return true;
      if (s.status === 'error') return false;
    } catch {
      /* transient — keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false; // timed out; the post still carries the asset id and self-heals on load
}

export function useUploadRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ video, videoAssetId, ...input }: UploadRecipeInput) => {
      // Photo post: images were already uploaded; create the recipe directly.
      if (input.images && input.images.length) {
        return apiSend<RecipeDetail>('POST', '/recipes', input);
      }
      // Cloudflare flow: the client already registered + uploaded the clip.
      if (videoAssetId) {
        return apiSend<RecipeDetail>('POST', '/recipes', { ...input, videoAssetId });
      }
      // Supabase flow: register the already-uploaded storage URL.
      const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video', video ?? undefined);
      return apiSend<RecipeDetail>('POST', '/recipes', { ...input, videoAssetId: ticket.videoAssetId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: ['me', 'drafts'] });
    },
  });
}

/** AI-extract a recipe from the clip to pre-fill the composer (mock until keyed). */
export function useExtractRecipe() {
  return useMutation({
    mutationFn: (videoAssetId?: string) =>
      apiSend<{ title: string; ingredients: string[]; steps: string[]; provider: 'openai' | 'mock' }>('POST', '/uploads/extract', videoAssetId ? { videoAssetId } : {}),
  });
}

/** The creator's own draft + scheduled posts. */
export function useDrafts(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'drafts'], queryFn: () => apiGet<{ drafts: DraftCard[] }>('/me/drafts'), enabled });
}

/** Publish a draft / scheduled post right now. */
export function usePublishDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => apiSend('POST', `/recipes/${recipeId}/publish`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'drafts'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Toggle follow for a cook. Pass the *current* following state to pick the verb. */
export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cookId, following }: { cookId: string; following: boolean }) =>
      apiSend(following ? 'DELETE' : 'POST', `/cooks/${cookId}/follow`),
    onMutate: async ({ cookId, following }) => {
      // Scope to cook queries (the feed's following flags self-heal via the
      // onSettled feed invalidation); don't cancel the whole client.
      await qc.cancelQueries({ queryKey: ['cook'] });
      const snap = snapshot(qc);
      patchCookEverywhere(qc, cookId, !following);
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** Block / unblock a user. Refreshes everything (blocking removes follows + hides
 *  content across the feed, search, profile, and comments). */
export function useToggleBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cookId, blocked }: { cookId: string; blocked: boolean }) =>
      apiSend(blocked ? 'DELETE' : 'POST', `/cooks/${cookId}/block`),
    onSuccess: (_d, { cookId, blocked }) => {
      qc.setQueryData<CookProfile>(keys.cook(cookId), (old) =>
        old ? { ...old, viewer: { ...old.viewer, blocked: !blocked, following: false }, recipes: blocked ? old.recipes : [] } : old,
      );
    },
    onSettled: () => {
      // Blocking hides content across every surface it can appear on.
      for (const key of [['feed'], ['cook'], keys.saved, ['search'], ['tag'], ['blocked'], ['comments'], ['notifications']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Mute / unmute a user (feed-only, silent). */
export function useToggleMute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cookId, muted }: { cookId: string; muted: boolean }) =>
      apiSend(muted ? 'DELETE' : 'POST', `/cooks/${cookId}/mute`),
    onSuccess: (_d, { cookId, muted }) => {
      qc.setQueryData<CookProfile>(keys.cook(cookId), (old) => (old ? { ...old, viewer: { ...old.viewer, muted: !muted } } : old));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['feed'] }),
  });
}

/** The accounts the viewer has blocked (Settings → Blocked accounts). */
export function useBlockedList() {
  return useQuery({ queryKey: ['blocked'], queryFn: () => apiGet<CookSummary[]>('/me/blocked') });
}

/* ─────────────────────────── direct messages ─────────────────────────── */

/** The DM inbox — polls while open so new messages surface without a manual refresh. */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiGet<ConversationDTO[]>('/messages'),
    enabled,
    refetchOnMount: 'always',
    refetchInterval: enabled ? 8000 : false,
    staleTime: 0,
  });
}

/** One thread (other user + messages). Marks read server-side on each load; polls while open. */
export function useThread(otherId: string | null) {
  return useQuery({
    queryKey: ['thread', otherId],
    queryFn: () => apiGet<ThreadDTO>(`/messages/with/${otherId}`),
    enabled: !!otherId,
    refetchOnMount: 'always',
    refetchInterval: otherId ? 4000 : false,
    staleTime: 0,
  });
}

/** Send a DM (optimistic append to the open thread). */
export function useSendMessage(otherId: string) {
  const qc = useQueryClient();
  const key = ['thread', otherId] as const;
  return useMutation({
    mutationFn: (text: string) => apiSend<MessageDTO>('POST', `/messages/with/${otherId}`, { text }),
    onSuccess: (msg) => {
      qc.setQueryData<ThreadDTO>(key, (old) => (old ? { ...old, messages: [...old.messages, msg] } : old));
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['messages-unread'] });
    },
  });
}

/** Delete a conversation from the viewer's inbox (per-user; the other side keeps theirs). */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otherId: string) => apiSend('DELETE', `/messages/with/${otherId}`),
    onSuccess: (_d, otherId) => {
      qc.removeQueries({ queryKey: ['thread', otherId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['messages-unread'] });
    },
  });
}

/** Unread-conversation count for the inbox badge (polled globally while signed in). */
export function useUnreadMessages() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({
    queryKey: ['messages-unread'],
    queryFn: () => apiGet<{ count: number }>('/messages/unread-count'),
    enabled: authed,
    refetchInterval: authed ? 20000 : false,
  });
}

/* ─────────────────────────── saved collections ─────────────────────────── */

/** The viewer's collections. Pass a recipeId to also get `hasRecipe` per collection (for the picker). */
export function useCollections(recipeId?: string) {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({
    queryKey: recipeId ? [...keys.collections, recipeId] : keys.collections,
    queryFn: () => apiGet<CollectionDTO[]>(`/me/collections${recipeId ? `?recipeId=${recipeId}` : ''}`),
    enabled: authed,
  });
}

/** Recipe cards inside one collection. */
export function useCollectionRecipes(id: string | null) {
  return useQuery({
    queryKey: keys.collection(id ?? ''),
    queryFn: () => apiGet<FeedResponse>(`/me/collections/${id}/recipes`),
    enabled: !!id,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiSend<CollectionDTO>('POST', '/me/collections', { name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.collections }),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/me/collections/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.collections }),
  });
}

/** Rename a collection (owner only). */
export function useRenameCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiSend('PATCH', `/me/collections/${id}`, { name }),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.collections });
      void qc.invalidateQueries({ queryKey: keys.collection(id) });
    },
  });
}

/** Add or remove a recipe from a collection. */
export function useToggleCollectionRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, recipeId, inCollection }: { collectionId: string; recipeId: string; inCollection: boolean }) =>
      inCollection
        ? apiSend('DELETE', `/me/collections/${collectionId}/recipes/${recipeId}`)
        : apiSend('POST', `/me/collections/${collectionId}/recipes`, { recipeId }),
    onSuccess: (_d, { collectionId }) => {
      void qc.invalidateQueries({ queryKey: keys.collections });
      void qc.invalidateQueries({ queryKey: keys.collection(collectionId) });
    },
  });
}
