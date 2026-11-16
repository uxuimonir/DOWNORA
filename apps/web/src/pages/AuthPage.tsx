import { Badge, Button, Input, Label, Logo, Panel } from '@downora/ui';
import { Info } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

/**
 * Sign-in screen. The form is built but disabled: there is no auth service
 * until the API ships (Phase 3), and a form that pretends to sign you in
 * would be worse than none.
 */
export function AuthPage() {
  const emailId = useId();
  const passwordId = useId();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Link to="/" aria-label="Downora home" className="self-start">
          <Logo />
        </Link>
        <div className="my-auto w-full max-w-sm self-center py-12">
          <h1 className="display-tight text-4xl font-semibold">Sign in to Downora</h1>
          <p className="mt-2 text-ink-muted">Keep your history and settings in sync on every device.</p>

          <div className="mt-6 flex gap-3 rounded-control border border-sky/25 bg-sky/8 p-3.5 text-sm" role="note">
            <Info className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden />
            <p className="text-ink-muted">
              <span className="font-medium text-ink">Accounts aren’t available yet.</span> They arrive with the Downora API.
              You can use every download feature without one today.
            </p>
          </div>

          <form className="mt-6 flex flex-col gap-4" aria-disabled="true" onSubmit={(e) => e.preventDefault()}>
            <fieldset disabled className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={emailId}>Email</Label>
                <Input id={emailId} type="email" autoComplete="email" placeholder="you@example.com" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={passwordId}>Password</Label>
                <Input id={passwordId} type="password" autoComplete="current-password" />
              </div>
              <Button type="submit" variant="primary" size="lg">
                Sign in
              </Button>
            </fieldset>
          </form>

          <Button className="mt-3 w-full" size="lg" asChild>
            <Link to="/dashboard">Continue without an account</Link>
          </Button>
        </div>
        <p className="text-xs text-ink-faint">Downora never asks for your passwords to other sites.</p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-line bg-surface lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(80%_60%_at_30%_20%,rgb(139_92_246/0.28),transparent_60%),radial-gradient(70%_60%_at_80%_90%,rgb(56_189_248/0.18),transparent_60%)]"
        />
        <div className="relative flex h-full flex-col justify-end p-12">
          <Panel level="raised" className="max-w-md p-6">
            <Badge tone="violet">With an account</Badge>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-ink-muted">
              <li>History that follows you from browser to desktop.</li>
              <li>The extension and desktop app share your settings.</li>
              <li>Conversion jobs that keep running when you close the tab.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
