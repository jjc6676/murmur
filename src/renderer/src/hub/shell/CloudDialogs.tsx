import { useState } from 'react';
import { Check, Copy, Plus, Users } from 'lucide-react';
import { Button, Card, Dialog, Field, Input, Tabs } from '../../ui';
import { toast } from '../state';

interface P {
  open: boolean;
  onClose: () => void;
}

const offline = () => toast('Murmur runs fully offline', { body: 'This cloud feature is not available. Every local feature remains unlocked.', tone: 'info' });

export function InviteTeamDialog({ open, onClose }: P) {
  const [emails, setEmails] = useState(['']);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite your team to join you on Murmur"
      description="Murmur is private and local. Team invitations are shown for parity but aren’t sent."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={offline}>Continue</Button></>}
    >
      {emails.map((email, index) => (
        <Field key={index} label={`Email ${index + 1}`}>
          <Input type="email" value={email} placeholder="teammate@company.com" onChange={(event) => setEmails((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />
        </Field>
      ))}
      <Button variant="ghost" icon={<Plus size={15} />} onClick={() => setEmails((current) => [...current, ''])}>Add more</Button>
    </Dialog>
  );
}

export function ReferralDialog({ open, onClose }: P) {
  const [tab, setTab] = useState<'refer' | 'past' | 'apply'>('refer');
  const [code, setCode] = useState('');
  const link = 'https://murmur.local/refer/offline';
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    toast('Referral link copied', { body: 'The offline edition does not send referral rewards.', tone: 'info' });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Refer a friend" width={600}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'refer', label: 'Refer' }, { id: 'past', label: 'Past referrals' }, { id: 'apply', label: 'Apply referral' }]} />
      {tab === 'refer' && <><p>Give a friend Murmur—free and offline forever.</p><Field label="Your referral link"><Input value={link} readOnly /></Field><Button icon={<Copy size={15} />} onClick={() => void copy()}>Copy link</Button></>}
      {tab === 'past' && <Card padded><Users size={24} /><h3>No past referrals</h3><p>Cloud referral tracking is unavailable in the offline edition.</p></Card>}
      {tab === 'apply' && <><Field label="Referral code"><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter code" /></Field><Button disabled={!code.trim()} onClick={offline}>Apply referral</Button></>}
    </Dialog>
  );
}

const PLANS = [
  { name: 'Free', price: '$0', text: 'Unlimited local dictation, Notetaker, Insights, Skills, and Memory.' },
  { name: 'Pro', price: '$0', text: 'Everything in Free—already unlocked on this device.' },
  { name: 'Growth & Enterprise', price: '$0', text: 'All offline features without seats, contracts, or cloud storage.' },
] as const;

export function UpgradeDialog({ open, onClose }: P) {
  return (
    <Dialog open={open} onClose={onClose} title="Plans & billing" width={760} footer={<Button onClick={onClose}>Done</Button>}>
      <Card padded>
        <Check size={22} />
        <strong>Murmur is free — every feature is unlocked</strong>
        <p>No subscription, account, usage cap, or payment method required.</p>
      </Card>
      {PLANS.map((plan) => <Card padded key={plan.name}><h3>{plan.name}</h3><strong>{plan.price} forever</strong><p>{plan.text}</p><Button variant="outline" onClick={offline}>Current plan</Button></Card>)}
    </Dialog>
  );
}
