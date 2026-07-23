import type { Lead } from '@/types';

function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  // If the string contains comma, quote, or newline, it must be enclosed in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    // Escape double quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCampaignCsv(leads: Pick<Lead, 'id' | 'name' | 'phone' | 'city' | 'property_type' | 'budget' | 'email'>[]): string {
  const headers = ['phone_number', 'customer_name', 'city', 'property_type', 'budget', 'lead_id', 'email'];
  
  const rows = leads.map(lead => {
    return [
      escapeCsvValue(lead.phone),
      escapeCsvValue(lead.name),
      escapeCsvValue(lead.city),
      escapeCsvValue(lead.property_type),
      escapeCsvValue(lead.budget),
      escapeCsvValue(lead.id),
      escapeCsvValue(lead.email)
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
