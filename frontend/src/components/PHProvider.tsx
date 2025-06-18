'use client';

import { PostHogProvider } from 'posthog-js/react';
import posthog from 'posthog-js';
import { useEffect } from 'react';

interface Props {
  children: React.ReactNode;
}

// Initialize PostHog on the client and expose it via React context.
// The component expects the following env vars to be present:
//   NEXT_PUBLIC_POSTHOG_KEY   – your PostHog project key (required)
//   NEXT_PUBLIC_POSTHOG_HOST  – PostHog host URL, defaults to https://us.i.posthog.com
export default function PHProvider({ children }: Props) {
  useEffect(() => {
    // Only initialise once and only in the browser
    if (typeof window === 'undefined') return;
    if ((posthog as any)?._initCalled) return; // prevent double-init in dev with React refresh

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!apiKey) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('PostHog: NEXT_PUBLIC_POSTHOG_KEY is not set – analytics disabled.');
      }
      return;
    }

    posthog.init(apiKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: 'history_change', // track client-side route changes automatically
    });
  }, []);

  // The PostHogProvider supplies the hook API (usePostHog etc.) to child components.
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
} 