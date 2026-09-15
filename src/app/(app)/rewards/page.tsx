'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Gift, Loader2, Trophy } from 'lucide-react';
import styles from './rewards.module.css';

export default function RewardsScreen() {
  const [loading, setLoading] = useState(true);
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRewardsData();
  }, []);

  const fetchRewardsData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch rewards list from DB
      const { data: rewardsData } = await supabase
        .from('rewards')
        .select('*')
        .eq('active', true)
        .order('points_cost', { ascending: true });

      setRewards(rewardsData ?? []);

      // 2. Fetch points balance from donor_profiles
      const { data: donorData } = await supabase
        .from('donor_profiles')
        .select('points_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      setPointsBalance(donorData?.points_balance ?? 0);
    } catch (err) {
      console.error('[Rewards] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (reward: any) => {
    if (pointsBalance < reward.points_cost) {
      alert(`You need ${reward.points_cost} points to redeem this reward.`);
      return;
    }

    setRedeemingId(reward.id);

    try {
      const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: reward.id });
      if (error) throw error;

      if (data?.new_balance != null) {
        setPointsBalance(data.new_balance);
      } else {
        await fetchRewardsData();
      }

      alert(`Success! Redeemed "${reward.title}" for ${reward.points_cost} points.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not redeem this reward.');
    } finally {
      setRedeemingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 size={36} color="var(--donor-primary-bright)" className="animate-spin" />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>Donor Rewards</h1>
        <div className={styles.pointsCard}>
          <span className={styles.pointsLabel}>Available Points</span>
          <span className={styles.pointsValue}>{pointsBalance}</span>
        </div>
      </div>

      <div className={styles.content}>
        <h2 className={styles.sectionTitle}>Available Rewards</h2>

        {rewards.length === 0 ? (
          <div className={styles.emptyBox}>
            <Trophy size={32} color="var(--donor-primary-bright)" />
            <strong>No rewards available yet</strong>
            <span>Real sponsor rewards will appear here after they are added in Supabase.</span>
          </div>
        ) : rewards.map((reward) => (
          <div key={reward.id} className={styles.rewardCard}>
            <div className={styles.rewardHeader}>
              <Gift size={24} color="var(--donor-primary-bright)" />
              <div className={styles.pointsBadge}>
                <span className={styles.pointsBadgeText}>{reward.points_cost} pts</span>
              </div>
            </div>
            <div className={styles.rewardTitle}>{reward.title}</div>
            <div className={styles.rewardSponsor}>{reward.sponsor_name}</div>
            <div className={styles.rewardDesc}>{reward.description}</div>

            <button
              className={`${styles.redeemBtn} ${pointsBalance < reward.points_cost ? styles.redeemBtnDisabled : ''}`}
              onClick={() => handleRedeem(reward)}
              disabled={pointsBalance < reward.points_cost || redeemingId === reward.id}
            >
              {redeemingId === reward.id ? 'Redeeming...' : 'Redeem'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
