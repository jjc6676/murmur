import { Copy } from 'lucide-react';
import { wordDiff } from '@shared/diff';
import { api, errorMessage } from '../../lib/api';
import { toast, useHubUi } from '../state';
import { Button, Dialog } from '../../ui';
import styles from './transforms.module.css';

export function DiffDialog() {
  const diff = useHubUi((state) => state.diff);
  const showDiff = useHubUi((state) => state.showDiff);
  async function copy() {
    if (!diff) return;
    try { await api.app.copyText(diff.after); toast('Result copied', { tone: 'success' }); }
    catch (cause) { toast('Could not copy result', { body: errorMessage(cause), tone: 'error' }); }
  }
  return <Dialog open={!!diff} onClose={() => showDiff(null)} title={diff?.title ?? 'See changes'} width={700} footer={<><Button variant="outline" icon={<Copy size={16} />} onClick={() => void copy()}>Copy result</Button><Button onClick={() => showDiff(null)}>Done</Button></>}>
    {diff && <div className={styles.diff}>{wordDiff(diff.before, diff.after).map((part, index) => part.kind === 'add' ? <ins className={styles.diffAdd} key={index}>{part.text}</ins> : part.kind === 'remove' ? <del className={styles.diffRemove} key={index}>{part.text}</del> : <span key={index}>{part.text}</span>)}</div>}
  </Dialog>;
}
