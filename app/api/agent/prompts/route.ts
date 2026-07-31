import { NextResponse } from 'next/server';
import { DograhApiError, DograhClient, DograhConfigError, dograh } from '@/lib/dograh';

/**
 * Lets the dashboard edit the agent's spoken text directly, instead of that
 * requiring a manual edit against Dograh's API. Deliberately scoped to just
 * the 4 prompt strings (global rules, opening line, main questions, closing) -
 * it never touches node routing/edges, extraction fields, or the LLM/voice
 * model, so a mistake here can change what Shreya says but not how the call
 * flow or model is wired.
 */

const NODE_TYPE_TO_KEY: Record<string, 'global' | 'start' | 'agenda' | 'end'> = {
  globalNode: 'global',
  startCall: 'start',
  agentNode: 'agenda',
  endCall: 'end',
};

const PROMPT_KEYS = ['global', 'start', 'agenda', 'end'] as const;
const MAX_PROMPT_LENGTH = 4000;

function resolveWorkflowId(): number {
  const id = Number.parseInt(process.env.DOGRAH_WORKFLOW_ID ?? '', 10);
  if (!Number.isFinite(id)) throw new DograhConfigError('DOGRAH_WORKFLOW_ID is not set.');
  return id;
}

function handleDograhError(context: string, error: unknown) {
  if (error instanceof DograhConfigError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof DograhApiError) {
    console.error(`[agent/prompts] ${context} provider error`, error.status, error.body?.slice(0, 300));
    return NextResponse.json(
      { error: 'The calling provider rejected the request.', providerStatus: error.status },
      { status: 502 },
    );
  }
  console.error(`[agent/prompts] ${context} unexpected`, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

export async function GET() {
  try {
    if (!DograhClient.isConfigured()) {
      return NextResponse.json({ error: 'Calling provider is not configured.' }, { status: 503 });
    }

    const workflowId = resolveWorkflowId();
    const workflow = await dograh.getWorkflow(workflowId);

    const prompts: Record<string, string> = {};
    for (const node of workflow.workflow_definition?.nodes ?? []) {
      const key = NODE_TYPE_TO_KEY[node.type];
      if (key) prompts[key] = node.data?.prompt ?? '';
    }

    return NextResponse.json({
      workflow_name: workflow.name ?? null,
      version: workflow.current_definition_id ?? null,
      prompts,
    });
  } catch (error) {
    return handleDograhError('GET', error);
  }
}

export async function PUT(request: Request) {
  try {
    if (!DograhClient.isConfigured()) {
      return NextResponse.json({ error: 'Calling provider is not configured.' }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    for (const key of PROMPT_KEYS) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) {
        return NextResponse.json({ error: `${key} must be a non-empty string` }, { status: 400 });
      }
      if (value.length > MAX_PROMPT_LENGTH) {
        return NextResponse.json({ error: `${key} is too long (max ${MAX_PROMPT_LENGTH} characters)` }, { status: 400 });
      }
      updates[key] = value;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No prompt text provided. Send at least one of: global, start, agenda, end.' }, { status: 400 });
    }

    const workflowId = resolveWorkflowId();

    // Fetch-modify-publish against the LIVE definition, same pattern used
    // manually via the API all session - only the requested node.data.prompt
    // strings are touched; everything else (edges, model config, API keys,
    // extraction fields) round-trips unchanged.
    const workflow = await dograh.getWorkflow(workflowId);
    const definition = workflow.workflow_definition;

    let changed = 0;
    for (const node of definition?.nodes ?? []) {
      const key = NODE_TYPE_TO_KEY[node.type];
      if (key && updates[key] !== undefined) {
        node.data.prompt = updates[key];
        changed++;
      }
    }
    if (changed === 0) {
      return NextResponse.json({ error: 'Could not find the matching node(s) in the live workflow.' }, { status: 500 });
    }

    await dograh.updateWorkflow(workflowId, definition, workflow.workflow_configurations);
    const published = await dograh.publishWorkflow(workflowId);

    return NextResponse.json({
      success: true,
      version: published?.version_number ?? null,
      updated: Object.keys(updates),
    });
  } catch (error) {
    return handleDograhError('PUT', error);
  }
}
