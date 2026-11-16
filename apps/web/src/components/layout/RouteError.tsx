import { Button, Logo } from '@downora/ui';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Logo className="justify-center" />
        <h1 className="mt-8 text-3xl font-semibold">This screen stopped working</h1>
        <p className="mt-3 text-ink-muted">
          Your downloads and settings are safe. Reload the page to continue.
        </p>
        <p className="mt-4 rounded-control border border-line bg-surface px-3 py-2 text-left text-xs break-words text-ink-faint">
          {message}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
