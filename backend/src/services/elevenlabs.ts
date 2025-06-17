import fs from 'fs';
// Use the global undici/whatwg FormData instead of the Node 'form-data' package so that
// Bun/undici fetch automatically sets the multipart boundaries.
// eslint-disable-next-line no-undef
const FormDataGlobal: typeof FormData = (global as any).FormData;
import { log } from '../utils/logger';
import { config } from '../config/env';

/**
 * Returns the API key to use for ElevenLabs calls.
 * If the user has saved their own key (BYOK) that key takes precedence.
 * Otherwise the shared demo key is returned (if configured).
 */
export const resolveElevenLabsKey = async (userId: string, getUserKey: (id:string, provider:string)=>Promise<string|null>): Promise<string | null> => {
  const byok = await getUserKey(userId, 'elevenlabs');
  if (byok) return byok;
  return config.ELEVENLABS_API_KEY || null;
};

/**
 * Transcribes an audio file using ElevenLabs Speech-to-Text.
 * @param audioPath absolute file path to the audio file
 * @param apiKey ElevenLabs key to use
 * @returns transcribed text (empty string on failure)
 */
export const transcribeAudio = async (audioPath: string, apiKey: string): Promise<string> => {
  try {
    const form = new FormDataGlobal();

    // ElevenLabs STT expects a standard multipart File upload.  The WHATWG
    // FormData implementation (used by undici/Bun) only serialises File/Blob
    // objects – Node streams are converted to the string "[object Object]",
    // which produced the 422 error we saw.  Read the file into a Buffer and
    // wrap it in a Blob so the boundary encoder sets the correct filename
    // and content-type.
    const fileBuf = await fs.promises.readFile(audioPath);
    const blob = new Blob([fileBuf], { type: 'audio/webm' });
    form.append('file', blob, 'audio.webm');
    form.append('model_id', 'scribe_v1');

    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      } as any,
      body: form as any,
    } as any);

    if (!resp.ok) {
      const body = await resp.text();
      log.error(`[11Labs] STT failed ${resp.status}: ${body}`);
      return '';
    }

    const data = await resp.json();
    return (data.text || data.transcript || '').trim();
  } catch (err) {
    log.error('[11Labs] STT error', err);
    return '';
  }
};

/**
 * Synthesises speech from text via ElevenLabs.
 * Returns a base64-encoded audio/mpeg data URL that can be played directly in the browser.
 */
export const synthesizeSpeech = async (text: string, apiKey: string, voiceId = 'EXAVITQu4vr4xnSDxMaL', modelId = 'eleven_multilingual_v2'): Promise<string | null> => {
  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      log.error(`[11Labs] TTS failed ${resp.status}: ${body}`);
      return null;
    }

    const arrayBuf = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');
    return `data:audio/mpeg;base64,${base64}`;
  } catch (err) {
    log.error('[11Labs] TTS error', err);
    return null;
  }
}; 