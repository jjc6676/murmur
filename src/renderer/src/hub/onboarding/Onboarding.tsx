// SCAFFOLD: replaced by the Settings/Onboarding slice.
import { api } from '../../lib/api';
import { Button } from '../../ui';

export function Onboarding() {
  return (
    <div style={{ padding: 40 }}>
      <Button onClick={() => void api.app.completeOnboarding()}>Skip onboarding</Button>
    </div>
  );
}
