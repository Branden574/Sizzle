import { useAuth } from './useAuth';
import { useSizzle } from '../store';

/**
 * Returns a guard for gated actions (like/save/follow/upload). If the viewer is
 * a guest it routes them to the login screen and returns false; otherwise true.
 */
export function useRequireAuth() {
  const status = useAuth((s) => s.status);
  const setMode = useAuth((s) => s.setMode);
  const setPhase = useSizzle((s) => s.setPhase);
  const setOnbStep = useSizzle((s) => s.setOnbStep);

  return () => {
    if (status === 'authed') return true;
    setMode('login');
    setOnbStep(3);
    setPhase('onboarding');
    return false;
  };
}
