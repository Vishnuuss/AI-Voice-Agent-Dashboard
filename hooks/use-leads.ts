import { useState, useEffect, useCallback, useRef } from 'react';
import type { Lead, LeadStats, CallLog } from '@/types';
import { DEFAULT_POLL_MS, useAutoRefresh } from './use-polling';

export interface LeadQuery {
  /** Comma-separated list of leads.status values. */
  status?: string;
  /** 'qualified' | 'not_qualified' - a separate column from status. */
  qualification?: string;
  /** Only leads with a follow_up_date set. */
  followUp?: boolean;
  /**
   * Comma-separated list of leads.call_outcome values — how the LAST call ended.
   * Separate from status: a busy number sits at status `retry_pending` with
   * call_outcome `busy`, so without this there was no way to list busy numbers.
   */
  outcome?: string;
  /** A column from the API's SORTABLE set, e.g. 'follow_up_date'. */
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Paginated lead list.
 *
 * The totals were previously read from `data.totalCount` while the route returned
 * `pagination.total`, so the count was always 0 and the pager never rendered.
 */
export function useLeads(query: string, filter: LeadQuery, page: number) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Serialised so the callback identity only changes when the filter really does.
  const filterKey = JSON.stringify(filter ?? {});

  const fetchLeads = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const parsed: LeadQuery = JSON.parse(filterKey);
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (parsed.status) params.set('status', parsed.status);
      if (parsed.qualification) params.set('qualification', parsed.qualification);
      if (parsed.followUp) params.set('followUp', 'true');
      if (parsed.outcome) params.set('outcome', parsed.outcome);
      if (parsed.sort) params.set('sort', parsed.sort);
      if (parsed.order) params.set('order', parsed.order);
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/leads?${params.toString()}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch leads: ${response.statusText}`);
      }

      const data = await response.json();
      setLeads(data.leads || []);
      setTotalCount(data.totalCount ?? data.pagination?.total ?? 0);
      setTotalPages(data.totalPages ?? data.pagination?.totalPages ?? 0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching leads');
      }
    } finally {
      setIsLoading(false);
    }
  }, [query, filterKey, page]);

  useEffect(() => {
    fetchLeads();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchLeads]);

  useAutoRefresh(fetchLeads, DEFAULT_POLL_MS);

  return { leads, totalCount, totalPages, isLoading, error, refresh: fetchLeads };
}

export function useLeadStats() {
  const [stats, setStats] = useState<LeadStats | null>(null);
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
      const response = await fetch('/api/leads/stats', {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch lead stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data.stats || data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching lead stats');
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

/**
 * One lead plus its full call history.
 *
 * The detail panel used to render a hard-coded empty transcript array, so opening
 * a lead that had been called showed an empty "Call recording & transcript" box.
 */
export function useLead(id: string | null) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchLead = useCallback(async () => {
    if (!id) {
      setLead(null);
      setCallHistory([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/leads/${id}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch lead: ${response.statusText}`);
      }

      const data = await response.json();
      setLead(data.lead || data);
      setCallHistory(data.callHistory || []);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching the lead');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchLead]);

  return { lead, callHistory, isLoading, error, refresh: fetchLead };
}

/** Saves an edit from the lead panel (follow-up date, note, status correction). */
export async function updateLead(id: string, patch: Record<string, any>) {
  const response = await fetch(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Failed to update lead (${response.status})`);
  return data.lead;
}
