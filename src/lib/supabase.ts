import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const REAL_SUPABASE_URL = 'https://nvisctcecmklbvnytcka.supabase.co';
const REAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aXNjdGNlY21rbGJ2bnl0Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjE3ODYsImV4cCI6MjEwMDQ5Nzc4Nn0.TD6kCeZyOvpPIO3pVAezNRd0GWR-cHgTt_MEBWjmQSc';

const supabaseUrl = (!rawUrl || rawUrl.includes('vymhbhqxdqplqjeytntt'))
  ? REAL_SUPABASE_URL
  : rawUrl;

const supabaseAnonKey = (!rawKey || rawKey.includes('vymhbhqxdqplqjeytntt'))
  ? REAL_SUPABASE_ANON_KEY
  : rawKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
