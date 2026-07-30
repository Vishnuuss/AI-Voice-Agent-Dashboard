import { useState, useEffect, useCallback, useRef } from 'react';

export interface DailyPoint {
  date: string;
  total: number;
  qualified: number;
}

/** Chart-ready shape: short weekday label plus the two series the chart draws. */
export interface OverviewPoint {
  day: string;
  calls: number;
  qualified: number;
}

/**
 * Daily call/qualification counts for the overview chart.
 *
 * Replaces the hard-coded Mon-Sun sample series the dashboard shipped with,
 * which showed invented traffic on a deployment that had never placed a call.
 */
export function useOverview(range = 7) {
  const [data, setData] = useState<OverviewPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchOverview = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/overview?range=${range}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch overview: ${response.statusText}`);
      }

      const payload = await response.json();
      const points: DailyPoint[] = payload.data || [];

      setData(
        points.map((point) => ({
          day: new Date(point.date).toLocaleDateString(undefined, { weekday: 'short' }),
          calls: point.total,
          qualified: point.qualified,
        })),
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching the overview');
      }
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchOverview();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchOverview]);

  return { data, isLoading, error, refresh: fetchOverview };
}
