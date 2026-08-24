"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  theme?: "auto" | "light" | "dark";
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.turnstile) resolve();
      else reject(new Error("Turnstile API unavailable"));
    };
    const onError = () => reject(new Error("Turnstile script failed to load"));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export type TurnstileWidgetHandle = {
  /** Reset the widget and invalidate the current single-use token. */
  reset: () => void;
};

type TurnstileWidgetProps = {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
};

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  TurnstileWidgetProps
>(function TurnstileWidget({ siteKey, action, onToken }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        const widgetId = widgetIdRef.current;
        if (!widgetId || !window.turnstile) return;
        onTokenRef.current(null);
        window.turnstile.reset(widgetId);
      },
    }),
    [],
  );

  useEffect(() => {
    let disposed = false;

    if (!siteKey.trim()) {
      setLoadError(true);
      onTokenRef.current(null);
      return () => {
        disposed = true;
      };
    }

    setLoadError(false);
    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return;
        const widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
          theme: "light",
        });
        widgetIdRef.current = widgetId;
      })
      .catch(() => {
        if (!disposed) {
          setLoadError(true);
          onTokenRef.current(null);
        }
      });

    return () => {
      disposed = true;
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove?.(widgetId);
        } catch {
          // The script may be unloading while React is removing the page.
        }
      }
      widgetIdRef.current = null;
      onTokenRef.current(null);
    };
  }, [action, siteKey]);

  return (
    <div className="flex min-h-[70px] flex-col items-center justify-center gap-1">
      <div ref={containerRef} />
      {loadError ? (
        <p className="text-xs text-red-600" role="alert">
          人機驗證載入失敗，請重新整理後再試。
        </p>
      ) : null}
    </div>
  );
});
