import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentDTO, CookProfile, CreateRecipeInput, DirectUploadTicket, FeedResponse, MeProfile, NotificationDTO, RecipeCard, RecipeDetail, SearchResults, SuggestedCook } from '@sizzle/shared';
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

export function useRecipe(id: string | null) {
  return useQuery({ queryKey: keys.recipe(id ?? ''), queryFn: () => apiGet<RecipeDetail>(`/recipes/${id}`), enabled: !!id });
}

export function useCook(id: string | null) {
  return useQuery({ queryKey: keys.cook(id ?? ''), queryFn: () => apiGet<CookProfile>(`/cooks/${id}`), enabled: !!id });
}

export function useComments(recipeId: string | null) {
  return useQuery({
    queryKey: ['comments', recipeId],
    queryFn: () => apiGet<CommentDTO[]>(`/recipes/${recipeId}/comments`),
    enabled: !!recipeId,
  });
}

export function useAddComment(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiSend<CommentDTO>('POST', `/recipes/${recipeId}/comments`, { text }),
    onSuccess: (created) => {
      qc.setQueryData<CommentDTO[]>(['comments', recipeId], (old) => (old ? [created, ...old] : [created]));
      void qc.invalidateQueries({ queryKey: ['feed'] }); // comment_count
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
    mutationFn: (input: { displayName?: string; handle?: string; bio?: string }) => apiSend('PATCH', '/me', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['cook'] });
    },
  });
}

/** Onboarding creator recommendations ranked by the selected tastes. */
export function useSuggestedCooks(tastes: string[]) {
  const sorted = [...tastes].sort();
  return useQuery({
    queryKey: ['cooks', 'suggested', sorted],
    queryFn: () => apiGet<SuggestedCook[]>(`/cooks/suggested?tastes=${encodeURIComponent(sorted.join(','))}&limit=8`),
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

const savePatch: CardPatch = (c) => ({ ...c, viewer: { ...c.viewer, saved: !c.viewer.saved } });

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
export function useUploadRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateRecipeInput, 'videoAssetId'>) => {
      const ticket = await apiSend<DirectUploadTicket>('POST', '/uploads/video');
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
