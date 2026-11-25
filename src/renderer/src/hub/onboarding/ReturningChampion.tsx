import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../../lib/api';
import { useSettings } from '../../lib/settings';
import { Button, Dialog } from '../../ui';
import { FeatureTour } from './FeatureTour';
import styles from './ReturningChampion.module.css';

const SESSION_KEY = 'murmur-returning-champion-shown';

export function ReturningChampion() {
  const settings = useSettings();
  const [totalWords, setTotalWords] = useState(0);
  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    void api.app.getOnboardingStats().then((stats) => {
      if (stats.totalWords > 0) {
        setTotalWords(stats.totalWords);
        setOpen(true);
      }
    });
  }, []);
  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(false);
  };
  return <>
    <Dialog open={open} onClose={dismiss} ariaLabel="Welcome back" width={520}>
      <div className={styles.content}><span className={styles.icon}><Trophy/></span><p className={styles.eyebrow}>RETURNING CHAMPION</p><h2>Welcome back{settings.profile.firstName ? `, ${settings.profile.firstName}` : ''}!</h2><p>You’ve dictated <strong>{totalWords.toLocaleString()} words</strong> with Murmur. Your local history and preferences are ready when you are.</p><div className={styles.actions}><Button variant="ghost" onClick={dismiss}>Not now</Button><Button onClick={() => { dismiss(); setTourOpen(true); }}>See what’s new</Button></div></div>
    </Dialog>
    <FeatureTour open={tourOpen} onClose={() => setTourOpen(false)}/>
  </>;
}
