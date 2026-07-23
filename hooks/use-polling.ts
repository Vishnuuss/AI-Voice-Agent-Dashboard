import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling<T>(url: string | null, intervalMs: number, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    try {
      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred during fetching');
      }
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (enabled && url) {
      fetchData(); // Initial fetch
      const intervalId = setInterval(fetchData, intervalMs);
      return () => {
        clearInterval(intervalId);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, url, intervalMs, fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
