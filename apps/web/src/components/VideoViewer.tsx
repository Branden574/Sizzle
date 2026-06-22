import { useSizzle } from '../store';
import { ErrorBoundary } from './ErrorBoundary';
import { FeedCard } from './Feed';

/**
 * Full-screen, feed-style player for a single recipe's video (TikTok-style).
 * Opened from the recipe view's video; reuses the exact feed card so the player,
 * action rail, and overlays match the feed 1:1. Sits below the rail's spawnable
 * sheets (comments/repost/more) so they still layer on top.
 */
export function VideoViewer() {
  const card = useSizzle((s) => s.viewerCard);
  const setViewerCard = useSizzle((s) => s.setViewerCard);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);

  if (!card) return null;

  // Closing returns to the recipe sheet it was launched from.
  const close = () => {
    setViewerCard(null);
    setOpenRecipe(card.id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: '#0c0a09', animation: 'sz-fadeIn .25s' }}>
      <ErrorBoundary>
        <FeedCard card={card} onClose={close} />
      </ErrorBoundary>
    </div>
  );
}
