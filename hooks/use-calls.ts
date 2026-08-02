import { useState, useEffect, useCallback, useRef } from 'react';
import type { CallLog, CallStats } from '@/types';
import { DEFAULT_POLL_MS, useAutoRefresh } from './use-polling';

/**
 * Call history.
 *
 * Fixes: the filter was sent as `?filter=` to a route that only understood
 * `direction`/`outcome` (and `direction` is not even a column, so it 500'd);
 * the totals were read from `data.totalCount` while the route returned
 * `pagination.total`; and nothing ever refetched, so new calls never appeared.
 */
export function useCalls(filter: string, page = 1, search = '') {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCalls = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter && filter !== 'all') params.set('filter', filter);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('limit', '20');

      const response = await fetch(`/api/calls?${params.toString()}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch calls: ${response.statusText}`);
      }

      const data = await response.json();
      setCalls(data.calls || []);
      setTotalCount(data.totalCount ?? data.pagination?.total ?? 0);
      setTotalPages(data.totalPages ?? data.pagination?.totalPages ?? 0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching calls');
      }
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    fetchCalls();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCalls]);

  useAutoRefresh(fetchCalls, DEFAULT_POLL_MS);

  return { calls, totalCount, totalPages, isLoading, error, refresh: fetchCalls };
}

export function useCallStats() {
  const [stats, setStats] = useState<CallStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/calls/stats', {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch call stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data.stats || data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching call stats');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  useAutoRefresh(fetchStats, DEFAULT_POLL_MS);

  return { stats, isLoading, error, refresh: fetchStats };
}

export interface TranscriptMessage {
  speaker: string;
  text: string;
  /** ISO timestamp of the turn, when the transcript carries one. */
  at?: string;
}

/**
 * Loads a call's transcript through our own API.
 *
 * The storage bucket sends no CORS headers, so the browser cannot fetch
 * transcript_url itself - which is why the lead panel could only ever show a
 * link and appeared broken.
 */
export function useTranscript(callId: string | null) {
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) {
      setMessages(null);
      setText(null);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`/api/calls/${callId}/transcript`, { signal: abortController.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed to load transcript (${res.status})`);
        setMessages(data.messages ?? null);
        setText(data.text ?? null);
      })
      .catch((err: any) => {
        if (err.name !== 'AbortError') setError(err.message || 'Could not load the transcript');
      })
      .finally(() => setIsLoading(false));

    return () => abortController.abort();
  }, [callId]);

  return { messages, text, isLoading, error };
}
