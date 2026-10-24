import { supabase } from '@/lib/supabase';

/**
 * Bystanders do not have to register, but the backend needs to know "someone" is calling
 * (to stop anonymous scraping of patient data). So if nobody is signed in we quietly start
 * an anonymous Supabase session. Requires Authentication -> Providers -> "Allow anonymous
 * sign-ins" to be ON in the Supabase dashboard.
 */
export async function ensureSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[ensureSession] anonymous sign-in failed:', error.message);
      return false;
    }
    return Boolean(anon.session);
  } catch (err) {
    console.warn('[ensureSession] failed:', err);
    return false;
  }
}
