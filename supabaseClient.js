'use strict';
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (err) {
    console.error('❌ Failed to initialize Supabase client:', err.message);
  }
}

function isConfigured() {
  return Boolean(supabase && SUPABASE_URL && SUPABASE_KEY);
}

async function checkConnection() {
  if (!isConfigured()) return { connected: false, reason: 'SUPABASE_URL or SUPABASE_KEY not configured' };
  try {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (error) {
      return { connected: false, reason: error.message };
    }
    return { connected: true, count };
  } catch (err) {
    return { connected: false, reason: err.message };
  }
}

module.exports = {
  supabase,
  isConfigured,
  checkConnection
};
