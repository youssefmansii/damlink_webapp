'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import { Loader2 } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const isPublicBystanderRoute = pathname.startsWith('/bystander');

  useEffect(() => {
    checkSession();
  }, [pathname]);

  const checkSession = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setHasSession(Boolean(session));

    if (!session && !isPublicBystanderRoute) {
      router.replace('/');
    } else {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--donor-bg)' }}>
        <Loader2 size={32} color="var(--donor-primary-bright)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '84px', minHeight: '100vh' }}>
      {children}
      {hasSession && <BottomNav />}
    </div>
  );
}
