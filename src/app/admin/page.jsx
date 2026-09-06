import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLatestRound } from '@/lib/queries';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect('/admin/login');

  // 최신+1 회차코드 추천
  const latest = await getLatestRound();
  const suggestedRound = latest
    ? `${latest.season}${String(latest.round_no + 1).padStart(3, '0')}`
    : '';

  return <AdminPanel email={user.email} suggestedRound={suggestedRound} />;
}
