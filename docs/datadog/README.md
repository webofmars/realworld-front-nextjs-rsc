# How-to: Add Datadog RUM to this Next.js app (TypeScript)

This guide walks you through adding [Datadog Real User Monitoring (RUM)](https://docs.datadoghq.com/real_user_monitoring/) to this Next.js 15 (App Router) application, porting the official JavaScript tutorial to TypeScript.

You will:

1. Install the Datadog browser SDK and its Next.js plugin
2. Configure the SDK through environment variables
3. Initialize RUM from a client component
4. Track App Router navigations
5. Report rendering errors from `error.tsx` and `global-error.tsx`

> **Why a client component instead of `instrumentation-client.ts`?**
> The official Datadog tutorial uses the `instrumentation-client.ts` file convention, which is only available starting with Next.js 15.2 (experimental) and stable from Next.js 15.5. This app runs on `next@15.0.1`, so we initialize RUM from a dedicated client component mounted once in the root layout instead. The rest of the integration is identical. If Next.js is ever upgraded to ≥ 15.5, see [Going further](#going-further-instrumentation-clientts).

---

## Step 1 — Install the dependencies

From the `front/` directory:

```bash
npm install @datadog/browser-rum @datadog/browser-rum-nextjs
```

Both packages ship their own TypeScript types, so nothing else is needed on the typing side.

## Step 2 — Configure environment variables

The SDK is initialized in the browser, so every configuration value must be exposed through a `NEXT_PUBLIC_*` variable (inlined at build time by Next.js).

Add the following block to `.env.example`, and copy it to your local `.env` with real values:

```bash
# Datadog RUM
NEXT_PUBLIC_DD_APPLICATION_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_DD_CLIENT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_DD_REMOTE_CONFIG_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_DD_SITE=datadoghq.eu
NEXT_PUBLIC_DD_SERVICE=realworld-front
NEXT_PUBLIC_DD_ENV=formation
NEXT_PUBLIC_DD_VERSION=0.1.0
NEXT_PUBLIC_DD_SESSION_SAMPLE_RATE=100
NEXT_PUBLIC_DD_REPLAY_SAMPLE_RATE=20
```

| Variable                             | Description                                                        |
| ------------------------------------ | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_DD_APPLICATION_ID`      | RUM application ID (Datadog UI → UX Monitoring → RUM Applications) |
| `NEXT_PUBLIC_DD_CLIENT_TOKEN`        | Public client token for browser intake                             |
| `NEXT_PUBLIC_DD_REMOTE_CONFIG_ID`    | Remote configuration ID (optional feature, removable)              |
| `NEXT_PUBLIC_DD_SITE`                | Datadog site, e.g. `datadoghq.eu` or `datadoghq.com`               |
| `NEXT_PUBLIC_DD_SERVICE`             | Unified service tag, e.g. `conduit-front`                          |
| `NEXT_PUBLIC_DD_ENV`                 | Environment tag: `dev`, `staging`, `prod`, …                       |
| `NEXT_PUBLIC_DD_VERSION`             | Deployed version tag, e.g. `0.1.0`                                 |
| `NEXT_PUBLIC_DD_SESSION_SAMPLE_RATE` | % of sessions captured (`0`–`100`)                                 |
| `NEXT_PUBLIC_DD_REPLAY_SAMPLE_RATE`  | % of captured sessions with Session Replay (`0`–`100`)             |

> `service` / `env` / `version` implement Datadog [unified service tagging](https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging/): set them per deployment, don't hardcode them.

## Step 3 — Create the RUM initialization component

Create `src/modules/common/components/datadog-init.tsx`. This is the TypeScript port of the tutorial's `instrumentation-client.js`: the configuration object is identical, only read from typed environment variables, and guarded so it runs exactly once in the browser.

```tsx
"use client";

import { datadogRum } from "@datadog/browser-rum";
import { nextjsPlugin } from "@datadog/browser-rum-nextjs";
import { useEffect } from "react";

const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID;
const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN;

const parseSampleRate = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== "" ? parsed : fallback;
};

export const DatadogInit = () => {
  useEffect(() => {
    // Skip when credentials are not configured (e.g. local dev without keys)
    if (!applicationId || !clientToken) {
      return;
    }
    // Guard against double initialization (Fast Refresh, Strict Mode remounts)
    if (datadogRum.getInitConfiguration()) {
      return;
    }

    datadogRum.init({
      applicationId,
      clientToken,
      remoteConfiguration: {
        id: process.env.NEXT_PUBLIC_DD_REMOTE_CONFIG_ID ?? "",
      },
      site: process.env.NEXT_PUBLIC_DD_SITE ?? "datadoghq.eu",
      service: process.env.NEXT_PUBLIC_DD_SERVICE,
      env: process.env.NEXT_PUBLIC_DD_ENV,
      version: process.env.NEXT_PUBLIC_DD_VERSION,
      sessionSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_DD_SESSION_SAMPLE_RATE, 100),
      sessionReplaySampleRate: parseSampleRate(process.env.NEXT_PUBLIC_DD_REPLAY_SAMPLE_RATE, 20),
      trackResources: true,
      trackUserInteractions: true,
      trackLongTasks: true,
      defaultPrivacyLevel: "mask-user-input",
      // Enable distributed tracing to the backend (uncomment when ready):
      // allowedTracingUrls: [process.env.API_BASE_URL ?? ""],
      plugins: [nextjsPlugin()],
    });
  }, []);

  return null;
};
```

Points of attention:

- `datadogRum.getInitConfiguration()` returns `undefined` until the SDK is initialized — that's our idempotency guard.
- `remoteConfiguration` can be dropped entirely if you don't use Datadog remote configuration.
- `defaultPrivacyLevel: "mask-user-input"` is the recommended setting for Session Replay; adjust to `allow` or `mask` if needed.

## Step 4 — Wire the component into the root layout

Edit `src/app/layout.tsx`: render `<DatadogInit />` and the plugin's `<DatadogAppRouter />` inside `<body>`, before `{children}`. `DatadogAppRouter` instruments App Router navigations (it replaces the tutorial's `onRouterTransitionStart` export, which only works with `instrumentation-client.ts`).

```tsx
import { DatadogInit } from "@/modules/common/components/datadog-init";
import { Footer } from "@/modules/common/components/footer";
import { Header } from "@/modules/features/auth/components/header";
import "@/styles/font.css";
import "@/styles/main.css";
import { DatadogAppRouter } from "@datadog/browser-rum-nextjs";
import "ionicons/css/ionicons.min.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const fetchCache = "default-no-store";

export const metadata: Metadata = {
  title: "Conduit",
  description: "Conduit",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: ReactNode;
}>) => {
  return (
    <html lang="en">
      <body>
        <DatadogInit />
        <DatadogAppRouter />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
};

export default RootLayout;
```

The layout itself stays a **server component** — only the two Datadog components are client-side.

## Step 5 — Report errors from `error.tsx`

The app already has `src/app/error.tsx` (a client component). Add a `useEffect` that forwards the caught error to Datadog with `addNextjsError`. The existing UI is unchanged; the `error` prop, previously unused, is now consumed:

```tsx
"use client";

import { Button } from "@/modules/common/components/button";
import { addNextjsError } from "@datadog/browser-rum-nextjs";
import { useEffect } from "react";

const Error = ({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) => {
  useEffect(() => {
    addNextjsError(error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="container page">
        <p className="error-message">⚠️Something went wrong!</p>
        <Button component="button" size="lg" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
};

export default Error;
```

## Step 6 — Add a `global-error.tsx`

`error.tsx` doesn't catch errors thrown in the root layout itself; Next.js uses `app/global-error.tsx` for that. Create `src/app/global-error.tsx` — it **must** render its own `<html>` and `<body>` tags because it replaces the root layout when active:

```tsx
"use client";

import { addNextjsError } from "@datadog/browser-rum-nextjs";
import { useEffect } from "react";

const GlobalError = ({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) => {
  useEffect(() => {
    addNextjsError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="error-page">
          <div className="container page">
            <p className="error-message">⚠️Something went wrong!</p>
            <button onClick={() => reset()}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
};

export default GlobalError;
```

## Step 7 — Validate

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Then start the dev server and browse a few pages:

```bash
npm run dev
```

- Without credentials configured: nothing happens, no error in the console (init is skipped).
- With real credentials: open the browser's Network tab and confirm requests to `rum.browser-intake-datadoghq.eu`; sessions should appear within minutes in **Datadog → UX Monitoring → RUM Applications → your app**, including route changes, resources, long tasks and Session Replays (for the sampled sessions).
- To test error reporting, temporarily `throw new Error("boom")` in a page component and check that an error event shows up in the RUM error tracking view.

## Troubleshooting

### CORS error on `browser-intake-datadoghq.eu` (status `(null)`)

Symptom in the browser console:

```text
Blocage d'une requête multiorigine (Cross-Origin Request) : la politique
« Same Origin » ne permet pas de consulter la ressource distante située sur
https://browser-intake-datadoghq.eu/api/v2/rum?...
Raison : échec de la requête CORS. Code d'état : (null).
```

This is almost always **not** a real CORS problem: the Datadog intake sends the proper CORS headers. A `(null)` status means the request never completed — it was blocked client-side. This app sets no `Content-Security-Policy`, so the usual suspects are:

1. **An ad blocker or tracking protection** — uBlock Origin, AdBlock Plus, or Firefox *Enhanced Tracking Protection* all block the Datadog intake domain (it's on tracker blocklists). This is the most common cause.
2. A corporate proxy / VPN blocking the domain.
3. (Rarely) an invalid client token — but that yields a `403`, not a CORS `(null)` failure.

How to confirm:

```bash
# Is the intake domain reachable at all?
curl -I https://browser-intake-datadoghq.eu/api/v2/rum
```

- Retry in a private window with extensions disabled, or allow `localhost` in your ad blocker.
- In Firefox, click the shield icon in the address bar and disable Enhanced Tracking Protection for the site.

If requests succeed after that, the integration is fine and the blocker is the browser.

### Durable fix: proxy the intake through your own domain

Ad blockers can't block first-party requests. Datadog supports a `proxyUrl` init option; combined with a Next.js rewrite, intake traffic goes through your own origin.

1. Add a rewrite in `next.config.ts`:

   ```ts
   import type { NextConfig } from "next";

   const nextConfig: NextConfig = {
     output: "standalone",
     async rewrites() {
       return [
         {
           source: "/dd/:path*",
           destination: "https://browser-intake-datadoghq.eu/:path*",
         },
       ];
     },
   };

   export default nextConfig;
   ```

2. Point the SDK at the proxy in `datadog-init.tsx`:

   ```tsx
   datadogRum.init({
     // ...
     proxyUrl: "/dd",
     // ...
   });
   ```

   The SDK then sends events to `/dd/api/v2/rum?...`, which Next.js forwards to the Datadog intake.

> Keep in mind the middleware matcher excludes `/dd` requests from auth/logging if needed (the current matcher `"/((?!api|_next/static|_next/image|.*\\.png$).*)"` **does** match `/dd`, so add it to the exclusions: `"/((?!api|dd|_next/static|_next/image|.*\\.png$).*)"`).

## Summary of touched files

| File                                             | Change                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `package.json`                                   | add `@datadog/browser-rum`, `@datadog/browser-rum-nextjs` |
| `.env.example`, `.env`                           | add `NEXT_PUBLIC_DD_*` variables                          |
| `src/modules/common/components/datadog-init.tsx` | **new** — typed RUM init client component                 |
| `src/app/layout.tsx`                             | render `<DatadogInit />` and `<DatadogAppRouter />`       |
| `src/app/error.tsx`                              | forward caught errors with `addNextjsError`               |
| `src/app/global-error.tsx`                       | **new** — root error boundary reporting to Datadog        |

## Going further: `instrumentation-client.ts`

If Next.js is upgraded to ≥ 15.5, the idiomatic setup becomes possible: move the `datadogRum.init(...)` call from `DatadogInit` into a top-level `src/instrumentation-client.ts` file, drop the `useEffect` guard (Next.js loads this file once, before hydration), and re-export router tracking from it:

```ts
// src/instrumentation-client.ts
import { datadogRum } from "@datadog/browser-rum";
import { nextjsPlugin } from "@datadog/browser-rum-nextjs";

datadogRum.init({
  // same configuration as Step 3
  applicationId: process.env.NEXT_PUBLIC_DD_APPLICATION_ID!,
  clientToken: process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN!,
  // ...
  plugins: [nextjsPlugin()],
});

export { onRouterTransitionStart } from "@datadog/browser-rum-nextjs";
```

With that convention, `<DatadogInit />` and `<DatadogAppRouter />` can both be removed from the layout. `error.tsx` / `global-error.tsx` stay as documented above.
