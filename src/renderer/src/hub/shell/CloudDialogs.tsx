import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Dialog, Field, Input } from '../../ui';
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
