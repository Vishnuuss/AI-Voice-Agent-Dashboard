/**
 * Why recordings and transcripts were missing from every reconciled call.
 *
 * Dograh reports a recording two different ways on the same run:
 *
 *   recording_url          "recordings/400.wav"                 a storage key
 *   recording_public_url   "https://vaani-api.../recording"     a fetchable link
 *
 * `usableMediaUrl` exists to reject the first, because a storage key rendered
 * into an <audio src> is a broken player. The trap is that the campaign-runs
 * LIST endpoint returns `recording_public_url: null` and
 * `public_access_token: null` while the per-run fetch returns the real links —
 * so the sweep, which reads the list, correctly rejected the only value it had
 * and stored NULL for every call.
 *
 * Verified against live runs 398 and 400 on 2026-09-03.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { usableMediaUrl } from '../lib/call-context.ts';

describe('usableMediaUrl', () => {
  test('accepts a real https link', () => {
    const url = 'https://vaani-api.bswealthfinance.com/api/v1/public/download/workflow/abc/recording';
    assert.equal(usableMediaUrl(url), url);
  });

  test('accepts http as well as https', () => {
    assert.equal(usableMediaUrl('http://example.test/a.wav'), 'http://example.test/a.wav');
  });

  test('rejects a bare storage key — this is what the LIST endpoint returns', () => {
    assert.equal(usableMediaUrl('recordings/400.wav'), null);
    assert.equal(usableMediaUrl('transcripts/400.txt'), null);
  });

  test('rejects an absolute path, which is still not fetchable from the browser', () => {
    assert.equal(usableMediaUrl('/recordings/400.wav'), null);
  });

  test('rejects null, undefined and empty', () => {
    assert.equal(usableMediaUrl(null), null);
    assert.equal(usableMediaUrl(undefined), null);
    assert.equal(usableMediaUrl(''), null);
    assert.equal(usableMediaUrl('   '), null);
  });

  test('rejects the string "None", which Jinja renders for a missing value', () => {
    // The webhook payload is a rendered template; a missing value arrives as
    // the literal text "None", not as null.
    assert.equal(usableMediaUrl('None'), null);
  });

  test('the exact pair from live run 400: list value rejected, detail value kept', () => {
    const fromList = {
      recording_url: 'recordings/400.wav',
      recording_public_url: null,
    };
    const fromDetail = {
      recording_url: 'recordings/400.wav',
      recording_public_url:
        'https://vaani-api.bswealthfinance.com/api/v1/public/download/workflow/2ed9fb30-7124-46eb-add2-e2883f135f43/recording',
    };

    // What the sweep used to compute, and stored: nothing.
    assert.equal(
      usableMediaUrl(fromList.recording_public_url) ?? usableMediaUrl(fromList.recording_url),
      null,
    );

    // What it computes now, after falling back to the per-run fetch.
    assert.equal(
      usableMediaUrl(fromDetail.recording_public_url) ?? usableMediaUrl(fromDetail.recording_url),
      fromDetail.recording_public_url,
    );
  });
});
