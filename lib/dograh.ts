import type { DograhCampaignProgress, DograhCampaignResponse, DograhPresignedResponse, DograhRunRecord } from '@/types';

export class DograhClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DOGRAH_API_KEY || '';
    this.baseUrl = process.env.DOGRAH_API_URL || 'https://app.dograh.com';

    if (!this.apiKey && process.env.NODE_ENV !== 'test') {
      console.warn('DOGRAH_API_KEY is not set');
    }
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  async getPresignedUploadUrl(fileName: string, fileSize: number): Promise<DograhPresignedResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/s3/presigned-upload-url`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        file_name: fileName,
        file_size: fileSize,
        content_type: 'text/csv'
      })
    });
    
    if (!res.ok) {
      throw new Error(`Failed to get presigned URL: ${res.status} ${await res.text()}`);
    }
    
    return res.json() as Promise<DograhPresignedResponse>;
  }

  async uploadCsvToS3(uploadUrl: string, csvContent: string): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/csv'
      },
      body: csvContent
    });
    
    if (!res.ok) {
      throw new Error(`Failed to upload CSV to S3: ${res.status} ${await res.text()}`);
    }
  }

  async createCampaign(params: {
    name: string;
    workflow_id: number;
    source_id: string;
    max_concurrency?: number;
    retry_config?: Record<string, any>;
    schedule_config?: Record<string, any>;
    circuit_breaker?: Record<string, any>;
  }): Promise<DograhCampaignResponse> {
    const payload = {
      ...params,
      source_type: 'csv'
    };

    const res = await fetch(`${this.baseUrl}/api/v1/campaign/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Failed to create campaign: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<DograhCampaignResponse>;
  }

  async startCampaign(campaignId: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/campaign/${campaignId}/start`, {
      method: 'POST',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to start campaign ${campaignId}: ${res.status} ${await res.text()}`);
    }
  }

  async pauseCampaign(campaignId: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/campaign/${campaignId}/pause`, {
      method: 'POST',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to pause campaign ${campaignId}: ${res.status} ${await res.text()}`);
    }
  }

  async resumeCampaign(campaignId: number): Promise<void> {
    return this.startCampaign(campaignId);
  }

  async getCampaignProgress(campaignId: number): Promise<DograhCampaignProgress> {
    const res = await fetch(`${this.baseUrl}/api/v1/campaign/${campaignId}/progress`, {
      method: 'GET',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to get campaign progress ${campaignId}: ${res.status} ${await res.text()}`);
    }
    
    return res.json() as Promise<DograhCampaignProgress>;
  }

  async getCampaignRuns(campaignId: number, page: number = 1, limit: number = 50): Promise<{ runs: DograhRunRecord[], total: number }> {
    const url = new URL(`${this.baseUrl}/api/v1/campaign/${campaignId}/runs`);
    url.searchParams.append('page', page.toString());
    url.searchParams.append('limit', limit.toString());

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to get campaign runs ${campaignId}: ${res.status} ${await res.text()}`);
    }
    
    return res.json() as Promise<{ runs: DograhRunRecord[], total: number }>;
  }

  async getCampaign(campaignId: number): Promise<DograhCampaignResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/campaign/${campaignId}`, {
      method: 'GET',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to get campaign ${campaignId}: ${res.status} ${await res.text()}`);
    }
    
    return res.json() as Promise<DograhCampaignResponse>;
  }

  async listCampaigns(): Promise<DograhCampaignResponse[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/campaign`, {
      method: 'GET',
      headers: this.headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to list campaigns: ${res.status} ${await res.text()}`);
    }
    
    return res.json() as Promise<DograhCampaignResponse[]>;
  }
}

export const dograh = new DograhClient();
