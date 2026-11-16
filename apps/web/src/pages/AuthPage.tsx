import { Button, Input, Logo, SegmentedControl } from '@downora/ui';
import { motion } from 'framer-motion';
import { AlertTriangle, Eye, EyeOff, Info } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ThemeControl } from '@/components/site/Navigation';
import { ApiError } from '@/lib/api/client';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAccount } from '@/stores/account';

export function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  useDocumentTitle(mode === 'login' ? 'Sign in' : 'Create account');
  const { status, init, signIn } = useAccount();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const emailId = useId();
  const pwId = useId();
  const errId = useId();
  const hintId = useId();
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/dashboard';

  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (status === 'signed_in' && !busy) navigate(next, { replace: true });
  }, [status, busy, navigate, next]);

  const unavailable = status === 'not_configured' || status === 'offline';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await signIn(mode, email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-clip px-4 pt-24 pb-10">
      <div aria-hidden className="aurora -z-10" />
      <header className="absolute inset-x-0 top-0 mx-auto flex max-w-[1280px] items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link to="/" aria-label="Downora home" className="flex min-h-11 items-center">
          <Logo />
        </Link>
        <ThemeControl />
      </header>
      <motion.main
        id="main"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 20 }}
        className="w-full max-w-[26rem] rounded-[2rem] border border-edge bg-surface/70 p-6 shadow-pop backdrop-blur-2xl sm:p-8"
      >
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.04em]">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-2 text-ink-muted">{mode === 'login' ? 'Sign in to convert files and keep your history in sync.' : 'Free. Needed only for conversions and synced history.'}</p>

        <SegmentedControl
          aria-label="Sign in or create an account"
          className="mt-6 grid w-full grid-cols-2"
          value={mode}
          onValueChange={(m) => {
            setMode(m);
            setError(undefined);
          }}
          options={[
            { value: 'login', label: 'Sign in' },
            { value: 'register', label: 'Create account' },
          ]}
        />

        {unavailable ? (
          <div className="mt-6 flex gap-3 rounded-control border border-line bg-raised p-3.5 text-sm" role="note">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <p className="text-ink-muted">
              <span className="font-medium text-ink">Accounts need Downora’s server, which isn’t connected.</span> Downloading original files works without one.
            </p>
          </div>
        ) : null}

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
          <fieldset disabled={unavailable || busy} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={emailId} className="text-sm font-medium">
                Email
              </label>
              <Input id={emailId} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errId : undefined} className="h-12" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={pwId} className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id={pwId}
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={[mode === 'register' ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined}
                  className="h-12 pr-12"
                />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute top-0 right-0 grid size-12 place-items-center text-ink-muted hover:text-ink">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {mode === 'register' ? (
                <p id={hintId} className="text-xs text-ink-muted">
                  At least 10 characters.
                </p>
              ) : null}
            </div>
            {error ? (
              <p id={errId} role="alert" className="flex gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </fieldset>
        </form>
        <Button variant="ghost" className="mt-2 w-full" asChild>
          <Link to="/dashboard">Continue without an account</Link>
        </Button>
        <p className="mt-6 text-center text-xs text-ink-muted">Downora never asks for your passwords to other sites.</p>
      </motion.main>
    </div>
  );
}
