import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nvisctcecmklbvnytcka.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aXNjdGNlY21rbGJ2bnl0Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjE3ODYsImV4cCI6MjEwMDQ5Nzc4Nn0.TD6kCeZyOvpPIO3pVAezNRd0GWR-cHgTt_MEBWjmQSc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
