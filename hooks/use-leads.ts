import { useState, useEffect, useCallback, useRef } from 'react';
import type { Lead, LeadStats, CallLog } from '@/types';

export function useLeads(query: string, statusFilter: string, page: number) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchLeads = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
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
      setTotalCount(data.totalCount || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching leads');
      }
    } finally {
      setIsLoading(false);
    }
  }, [query, statusFilter, page]);

  useEffect(() => {
    fetchLeads();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchLeads]);

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

  return { stats, isLoading, error, refresh: fetchStats };
}

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
