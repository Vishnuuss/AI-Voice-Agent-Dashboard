import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No data to export' }, { status: 404 });
    }

    const headers = ['id', 'name', 'phone', 'email', 'city', 'status', 'qualification', 'score', 'created_at', 'call_outcome'];
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const lead of leads) {
      const row = [
        lead.id,
        `"${(lead.name || '').replace(/"/g, '""')}"`,
        lead.phone,
        lead.email || '',
        `"${(lead.city || '').replace(/"/g, '""')}"`,
        lead.status,
        lead.qualification || '',
        lead.score || 0,
        lead.created_at,
        lead.call_outcome || ''
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads_export_${Date.now()}.csv"`
      }
    });
  } catch (error: any) {
    console.error('Error GET /api/reports/export:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
