import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminAppealDTO, AdminLogDTO, AdminReportGroupDTO, AdminStats, AdminUserDTO, CollectionDTO, CommentDTO, CookProfile, CookSummary, CreateRecipeInput, DirectUploadTicket, FeedResponse, MeProfile, NotificationDTO, RecipeCard, RecipeDetail, ReportInput, SearchResults, SuggestedCook, SupportRequestDTO, TrendingTag, VerificationTier } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
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

export function useForYouFeed() {
  return useQuery({ queryKey: keys.forYou, queryFn: () => apiGet<FeedResponse>('/feed/for-you') });
}

export function useFollowingFeed() {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: keys.following, queryFn: () => apiGet<FeedResponse>('/feed/following'), enabled: authed });
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

export function useReportRecipe(recipeId: string) {
  return useMutation({
    mutationFn: (input: ReportInput) => apiSend('POST', `/recipes/${recipeId}/report`, input),
  });
}

/** Repost / un-repost a recipe (optimistic on the card). */
export function useToggleRepost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, reposted, comment }: { recipeId: string; reposted: boolean; comment?: string }) =>
      reposted ? apiSend('DELETE', `/recipes/${recipeId}/repost`) : apiSend('POST', `/recipes/${recipeId}/repost`, { comment }),
    onMutate: async ({ recipeId, reposted }) => {
      await qc.cancelQueries();
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

/* ───────────────────── optimistic cache helpers ─────────────────── */

type CardPatch = (card: RecipeCard) => RecipeCard;

/** Apply a patch to a recipe everywhere it appears in the cache (feeds, saved, detail, cook grids). */
function patchRecipeEverywhere(qc: QueryClient, recipeId: string, patch: CardPatch) {
  for (const key of [keys.forYou, keys.following, keys.saved]) {
    qc.setQueryData<FeedResponse>(key, (old) =>
      old ? { ...old, items: old.items.map((it) => (it.id === recipeId ? patch(it) : it)) } : old,
    );
  }
  qc.setQueryData<RecipeDetail>(keys.recipe(recipeId), (old) => (old ? (patch(old) as RecipeDetail) : old));
  for (const [key, data] of qc.getQueriesData<CookProfile>({ queryKey: ['cook'] })) {
    if (data?.recipes.some((r) => r.id === recipeId)) {
      qc.setQueryData<CookProfile>(key, { ...data, recipes: data.recipes.map((r) => (r.id === recipeId ? patch(r) : r)) });
    }
  }
}

/** Apply a follow-state change to every card by a cook + that cook's profile. */
function patchCookEverywhere(qc: QueryClient, cookId: string, following: boolean) {
  const cardFix = (it: RecipeCard) =>
    it.cook.id === cookId ? { ...it, viewer: { ...it.viewer, following } } : it;
  for (const key of [keys.forYou, keys.following, keys.saved]) {
    qc.setQueryData<FeedResponse>(key, (old) => (old ? { ...old, items: old.items.map(cardFix) } : old));
  }
  qc.setQueryData<CookProfile>(keys.cook(cookId), (old) => (old ? { ...old, viewer: { following } } : old));
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
      await qc.cancelQueries();
      const snap = snapshot(qc);
      patchRecipeEverywhere(qc, recipeId, patch);
      return { snap };
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: (_data, _err, recipeId) => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: keys.recipe(recipeId) });
    },
  });
}

export const useToggleLike = () => useRecipeAction('like', likePatch);
export const useToggleDislike = () => useRecipeAction('dislike', dislikePatch);
export const useToggleSave = () => useRecipeAction('save', savePatch);

/** Toggle offline download. Pass the *current* downloaded state to pick the verb. */
export function useToggleDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, downloaded }: { recipeId: string; downloaded: boolean }) =>
      apiSend(downloaded ? 'DELETE' : 'POST', `/recipes/${recipeId}/download`),
    onMutate: async ({ recipeId, downloaded }) => {
      await qc.cancelQueries();
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
};

export function useUploadRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ video, ...input }: UploadRecipeInput) => {
      // Photo post: images were already uploaded; create the recipe directly.
      if (input.images && input.images.length) {
        return apiSend<RecipeDetail>('POST', '/recipes', input);
      }
      const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video', video ?? undefined);
      return apiSend<RecipeDetail>('POST', '/recipes', { ...input, videoAssetId: ticket.videoAssetId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
      void qc.invalidateQueries({ queryKey: keys.me });
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
      await qc.cancelQueries();
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
