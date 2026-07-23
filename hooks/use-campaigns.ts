import { useState, useEffect, useCallback, useRef } from 'react';
import type { CampaignRun, CampaignStats, DograhCampaignProgress } from '@/types';
import { usePolling } from './use-polling';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCampaigns = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/campaigns', {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch campaigns: ${response.statusText}`);
      }

      const data = await response.json();
      setCampaigns(data.campaigns || data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching campaigns');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCampaigns]);

  return { campaigns, isLoading, error, refresh: fetchCampaigns };
}

export function useCampaignStats() {
  const [stats, setStats] = useState<CampaignStats | null>(null);
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
      const response = await fetch('/api/campaigns/stats', {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch campaign stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data.stats || data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred fetching campaign stats');
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

export function useCampaignProgress(campaignId: string | null, dograhCampaignId: number | null) {
  const [isPolling, setIsPolling] = useState(false);
  
  const shouldPoll = Boolean(campaignId && dograhCampaignId && isPolling);
  const url = shouldPoll ? `/api/campaigns/${campaignId}/progress` : null;
  
  const { data, isLoading, error } = usePolling<{ progress: DograhCampaignProgress }>(
    url,
    10000,
    shouldPoll
  );

  const progress = data?.progress || null;

  useEffect(() => {
    if (campaignId && dograhCampaignId) {
      setIsPolling(true);
    } else {
      setIsPolling(false);
    }
  }, [campaignId, dograhCampaignId]);

  useEffect(() => {
    if (progress) {
      if (progress.progress_percentage === 100 || progress.state === 'completed') {
        setIsPolling(false);
      }
    }
  }, [progress]);

  return { progress, isPolling, error };
}

export async function launchCampaign(params: any): Promise<CampaignRun> {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to launch campaign: ${response.statusText}`);
  }

  const data = await response.json();
  return data.campaign || data;
}

export async function pauseCampaign(id: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${id}/pause`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to pause campaign: ${response.statusText}`);
  }
}

export async function resumeCampaign(id: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${id}/resume`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to resume campaign: ${response.statusText}`);
  }
}
