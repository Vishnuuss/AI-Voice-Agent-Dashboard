import { useState, useEffect, useCallback, useRef } from 'react';
import type { CallLog, CallStats } from '@/types';

export function useCalls(filter: string) {
  const [calls, setCalls] = useState<CallLog[]>([]);
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
      if (filter && filter !== 'all') {
        params.set('filter', filter);
      }

      const response = await fetch(`/api/calls?${params.toString()}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch calls: ${response.statusText}`);
      }

      const data = await response.json();
      setCalls(data.calls || data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching calls');
      }
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchCalls();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCalls]);

  return { calls, isLoading, error, refresh: fetchCalls };
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

  return { stats, isLoading, error, refresh: fetchStats };
}
