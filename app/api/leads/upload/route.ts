import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { validatePhoneNumber } from '@/lib/validators';

/**
 * Simple CSV parser — handles quoted fields and commas within quotes.
 * No external dependency needed for basic CSV.
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length === headers.length) {
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = values[idx] || '';
      });
      records.push(record);
    }
  }

  return records;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const fileContent = await file.text();
    const records = parseCSV(fileContent);

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV is empty or invalid' }, { status: 400 });
    }

    const supabase = createServerClient();

    // --- Create upload batch ---
    const { data: batch, error: batchError } = await supabase
      .from('upload_batches')
      .insert({
        filename: file.name,
        total_rows: records.length,
      })
      .select()
      .single();

    if (batchError || !batch) {
      console.error('Failed to create upload batch:', batchError);
      return NextResponse.json({ error: 'Failed to create upload batch' }, { status: 500 });
    }

    let validCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;

    const validLeads: any[] = [];
    const rejectedLeads: any[] = [];

    for (const record of records) {
      // Find the phone field — could be phone_number, phone, mobile, contact
      const rawPhone =
        record.phone_number || record.phone || record.mobile || record.contact || '';

      const phone = validatePhoneNumber(rawPhone);
      if (!phone) {
        rejectedCount++;
        rejectedLeads.push({
          batch_id: batch.id,
          raw_data: record,
          reason: `Invalid phone number: "${rawPhone}"`,
        });
        continue;
      }

      // Find the name field — could be name, customer_name, full_name
      const name =
        record.name || record.customer_name || record.full_name || 'Unknown';

      validLeads.push({
        phone: phone,
        name: name,
        email: record.email || null,
        city: record.city || record.location || null,
        source: record.source || 'CSV Upload',
        property_type: record.property_type || record.property || null,
        budget: record.budget || null,
        status: 'new',
        batch_id: batch.id,
      });
    }

    // --- Upsert valid leads (ON CONFLICT phone) ---
    if (validLeads.length > 0) {
      // Check which phones already exist
      const phones = validLeads.map((l) => l.phone);
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone')
        .in('phone', phones);

      const existingPhones = new Set((existingLeads || []).map((l) => l.phone));

      const newLeads = validLeads.filter((l) => !existingPhones.has(l.phone));
      const dupeLeads = validLeads.filter((l) => existingPhones.has(l.phone));

      duplicateCount = dupeLeads.length;

      if (newLeads.length > 0) {
        const { data, error } = await supabase
          .from('leads')
          .insert(newLeads)
          .select();

        if (error) {
          console.error('Error inserting leads:', error);
          // Try one by one for partial success
          for (const lead of newLeads) {
            const { error: singleError } = await supabase
              .from('leads')
              .insert(lead);
            if (!singleError) {
              validCount++;
            } else {
              rejectedCount++;
              rejectedLeads.push({
                batch_id: batch.id,
                raw_data: lead,
                reason: `Insert failed: ${singleError.message}`,
              });
            }
          }
        } else {
          validCount = (data || []).length;
        }
      }
    }

    // --- Save rejected leads ---
    if (rejectedLeads.length > 0) {
      const { error: rejError } = await supabase
        .from('rejected_leads')
        .insert(rejectedLeads);
      if (rejError) {
        console.error('Failed to save rejected leads:', rejError);
      }
    }

    // --- Update batch stats ---
    const { error: batchUpdateError } = await supabase
      .from('upload_batches')
      .update({
        valid_rows: validCount,
        rejected_rows: rejectedCount,
        duplicate_rows: duplicateCount,
      })
      .eq('id', batch.id);

    if (batchUpdateError) {
      console.error('Failed to update batch stats:', batchUpdateError);
    }

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      summary: {
        total: records.length,
        valid: validCount,
        duplicate: duplicateCount,
        rejected: rejectedCount,
      },
    });
  } catch (error: any) {
    console.error('Unexpected error in POST /api/leads/upload:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
