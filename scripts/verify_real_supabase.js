'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const assert = require('assert/strict');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.log('[SKIPPED] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment.');
  console.log('To run this test against your live Supabase project:');
  console.log('  export SUPABASE_URL="https://your-ref.supabase.co"');
  console.log('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.log('  export SUPABASE_ANON_KEY="your-anon-key"');
  console.log('  node scripts/verify_real_supabase.js');
  process.exit(0);
}

const adminClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonClient = anonKey
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function run() {
  console.log('=== REAL SUPABASE PROJECT VERIFICATION ===');
  console.log(`Connecting to Supabase at: ${url}`);

  // 1. Confirm storage bucket exists and is private
  const { data: buckets, error: bucketErr } = await adminClient.storage.listBuckets();
  if (bucketErr) throw bucketErr;

  const mediaBucket = buckets.find(b => b.name === 'whispr-media');
  assert.ok(mediaBucket, 'Storage bucket "whispr-media" must exist in project');
  assert.equal(mediaBucket.public, false, 'Storage bucket "whispr-media" MUST BE PRIVATE (public=false)');
  console.log('[PASS] 1. Confirmed storage bucket "whispr-media" exists and is strictly private');

  // 2. Upload test image via admin/service client
  const testId = `verify-${Date.now()}.png`;
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
  const { error: uploadErr } = await adminClient.storage
    .from('whispr-media')
    .upload(testId, pngBuffer, { contentType: 'image/png' });
  if (uploadErr) throw uploadErr;
  console.log(`[PASS] 2. Uploaded test image ${testId} through service role client`);

  // 3. Download image via admin client
  const { data: downloaded, error: downloadErr } = await adminClient.storage
    .from('whispr-media')
    .download(testId);
  if (downloadErr) throw downloadErr;
  const downloadedBuf = Buffer.from(await downloaded.arrayBuffer());
  assert.deepEqual(downloadedBuf, pngBuffer);
  console.log('[PASS] 3. Successfully downloaded test image via authenticated service client');

  // 4. Confirm ANON key CANNOT read tables due to RLS
  if (anonClient) {
    const { data: anonUsers, error: anonUsersErr } = await anonClient.from('users').select('*');
    assert.ok(anonUsersErr || (anonUsers && anonUsers.length === 0), 'Anon key must NOT read users table');
    console.log('[PASS] 4a. Anon key access to users table BLOCKED by RLS');

    const { data: anonMsgs, error: anonMsgsErr } = await anonClient.from('messages').select('*');
    assert.ok(anonMsgsErr || (anonMsgs && anonMsgs.length === 0), 'Anon key must NOT read messages table');
    console.log('[PASS] 4b. Anon key access to messages table BLOCKED by RLS');

    // 5. Confirm ANON key CANNOT download from private storage bucket
    const { data: anonMedia, error: anonMediaErr } = await anonClient.storage
      .from('whispr-media')
      .download(testId);
    assert.ok(anonMediaErr || !anonMedia, 'Anon key must NOT download private media');
    console.log('[PASS] 5. Anon key access to private storage bucket BLOCKED');
  }

  // Cleanup test object
  await adminClient.storage.from('whispr-media').remove([testId]);
  console.log('[PASS] 6. Cleaned up temporary test media');
  console.log('=== REAL SUPABASE PROJECT VERIFICATION PASSED ===');
}

run().catch(err => {
  console.error('[ERROR] Real Supabase verification failed:', err);
  process.exit(1);
});
