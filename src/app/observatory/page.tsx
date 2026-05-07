import ObservatoryPanel from '@/components/observatory/ObservatoryPanel';

export const metadata = { title: 'Observatory — Stargazer', description: 'Full remote observatory control center' };

export default function ObservatoryPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#020817', padding: '0 24px 48px' }}>
      <ObservatoryPanel />
    </main>
  );
}
