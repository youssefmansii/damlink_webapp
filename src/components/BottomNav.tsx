'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScanFace, Map as MapIcon, Clock, Gift, User } from 'lucide-react';
import styles from './BottomNav.module.css';

export default function BottomNav() {
  const pathname = usePathname();
  const isBystander = pathname.startsWith('/bystander');
  
  const activeColor = isBystander ? 'var(--bystander-primary-bright)' : 'var(--donor-primary-bright)';
  const inactiveColor = isBystander ? 'var(--bystander-tab-inactive)' : 'var(--donor-tab-inactive)';

  return (
    <div className={styles.navContainer}>
      <Link href={isBystander ? '/bystander' : '/donor'} className={styles.navItem}>
        {isBystander ? (
          <ScanFace size={24} color={pathname === '/bystander' || pathname === '/donor' ? activeColor : inactiveColor} />
        ) : (
          <Home size={24} color={pathname === '/bystander' || pathname === '/donor' ? activeColor : inactiveColor} />
        )}
        <span style={{ color: pathname === '/bystander' || pathname === '/donor' ? activeColor : inactiveColor }}>
          {isBystander ? 'Scan' : 'Home'}
        </span>
      </Link>
      
      <Link href="/map" className={styles.navItem}>
        <MapIcon size={24} color={pathname === '/map' ? activeColor : inactiveColor} />
        <span style={{ color: pathname === '/map' ? activeColor : inactiveColor }}>Map</span>
      </Link>
      
      <Link href="/history" className={styles.navItem}>
        <Clock size={24} color={pathname === '/history' ? activeColor : inactiveColor} />
        <span style={{ color: pathname === '/history' ? activeColor : inactiveColor }}>History</span>
      </Link>
      
      {!isBystander && (
        <Link href="/rewards" className={styles.navItem}>
          <Gift size={24} color={pathname === '/rewards' ? activeColor : inactiveColor} />
          <span style={{ color: pathname === '/rewards' ? activeColor : inactiveColor }}>Rewards</span>
        </Link>
      )}

      <Link href="/profile" className={styles.navItem}>
        <User size={24} color={pathname === '/profile' ? activeColor : inactiveColor} />
        <span style={{ color: pathname === '/profile' ? activeColor : inactiveColor }}>Profile</span>
      </Link>
    </div>
  );
}
