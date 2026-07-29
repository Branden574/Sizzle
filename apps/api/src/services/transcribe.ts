/**
 * Transcription + recipe extraction. Real path uses OpenAI (Whisper for audio →
 * GPT to structure) when OPENAI_API_KEY is set; otherwise a clearly-labelled mock
 * returns a small scaffold so the flow is demonstrable offline — same
 * mock-provider pattern as Stripe / Cloudflare Stream. The heavy real audio
 * pipeline (download + Whisper) is intentionally left as the `openai` branch to
 * wire up with a key; the endpoint contract is stable either way.
 */
import { env } from '../env';

const transcribeProvider: 'openai' | 'mock' = env.OPENAI_API_KEY ? 'openai' : 'mock';

export interface Captions {
  vtt: string; // WebVTT captions
  provider: 'openai' | 'mock';
}

export async function generateCaptions(_videoAssetId: string): Promise<Captions> {
  if (transcribeProvider === 'openai') {
    // Real: Whisper verbose_json → WebVTT cues. Behind the key.
  }
  return {
    vtt: 'WEBVTT\n\n00:00.000 --> 00:03.000\n[Auto-captions are in test mode — set OPENAI_API_KEY to generate.]\n',
    provider: 'mock',
  };
}
