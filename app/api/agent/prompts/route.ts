import { NextResponse } from 'next/server';
import { DograhApiError, DograhClient, DograhConfigError, dograh } from '@/lib/dograh';
import { DEFAULT_VERTICAL, parseVertical, VERTICAL_LABELS } from '@/lib/verticals';

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

/**
 * What the caller actually HEARS from a node, which is not always `data.prompt`.
 *
 * A startCall node with `greeting_type: 'text'` - which is how workflow 1 is
 * configured - speaks `data.greeting` verbatim and ignores `data.prompt`
 * entirely. This page read and wrote `prompt`, so editing the opening greeting
 * changed a field the agent never reads: the button worked, the toast said
 * "Saved and published", and the caller kept hearing the old line. The two
 * fields had already drifted apart on the live workflow.
 *
 * Reads prefer `greeting` on a start node; writes set BOTH, so the spoken line
 * changes whether the node is in `text` mode (greeting) or `llm` mode (prompt),
 * and the two can never drift again.
 */
function readNodeText(node: any): string {
  if (node?.type === 'startCall') return node.data?.greeting ?? node.data?.prompt ?? '';
  return node?.data?.prompt ?? '';
}

/**
 * Which agent's script this page is editing.
 *
 * This route had its own copy of the single-workflow assumption, so once more
 * than one business line exists the AI Agent page would have edited the LOAN
 * agent's spoken text no matter which vertical was selected on screen - quietly
 * changing what a live agent says to real customers.
 *
 * Mirrors the mapping in app/api/campaigns/route.ts deliberately: loan falls
 * back to the original DOGRAH_WORKFLOW_ID, the others must be set explicitly.
 */
function resolveWorkflowId(verticalParam: string | null): number {
  const vertical = parseVertical(verticalParam ?? DEFAULT_VERTICAL) ?? DEFAULT_VERTICAL;
  const raw =
    vertical === 'loan'
      ? process.env.DOGRAH_WORKFLOW_ID_LOAN ?? process.env.DOGRAH_WORKFLOW_ID
      : process.env[`DOGRAH_WORKFLOW_ID_${vertical.toUpperCase()}`];

  const id = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(id)) {
    throw new DograhConfigError(
      `No calling agent is configured for the ${VERTICAL_LABELS[vertical]} business line, so there is no script to edit.`,
    );
  }
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

export async function GET(request: Request) {
  try {
    if (!DograhClient.isConfigured()) {
      return NextResponse.json({ error: 'Calling provider is not configured.' }, { status: 503 });
    }

    const workflowId = resolveWorkflowId(new URL(request.url).searchParams.get('vertical'));
    const workflow = await dograh.getWorkflow(workflowId);

    const prompts: Record<string, string> = {};
    for (const node of workflow.workflow_definition?.nodes ?? []) {
      const key = NODE_TYPE_TO_KEY[node.type];
      if (key) prompts[key] = readNodeText(node);
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

    // Taken from the query string, not the body, so it matches the GET that
    // loaded these prompts - editing one agent's script and saving it onto
    // another's is exactly the mistake this guards against.
    const workflowId = resolveWorkflowId(new URL(request.url).searchParams.get('vertical'));

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
        // A startCall node in `text` mode speaks `greeting`, not `prompt`.
        // Writing both is what makes the edit actually reach the caller.
        if (node.type === 'startCall') node.data.greeting = updates[key];
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
