import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data: settings, error } = await supabase
      .from('settings')
      .select('key, value');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const settingsMap = (settings || []).reduce((acc: Record<string, any>, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    return NextResponse.json({ settings: settingsMap });
  } catch (error: any) {
    console.error('Error GET /api/settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ setting: data });
  } catch (error: any) {
    console.error('Error PUT /api/settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
