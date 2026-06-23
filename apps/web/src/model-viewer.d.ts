import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// <model-viewer> is a custom element from @google/model-viewer; declare it so
// TSX accepts the tag + its attributes.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        exposure?: string | number;
        'shadow-intensity'?: string | number;
        'environment-image'?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'auto-rotate-delay'?: string | number;
        'rotation-per-second'?: string;
        'interaction-prompt'?: string;
        'camera-orbit'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'field-of-view'?: string;
        'disable-zoom'?: boolean;
        'touch-action'?: string;
        loading?: string;
        reveal?: string;
      };
    }
  }
}
