import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg" data-keep-hall="1">
      <img
        src="/ui/forge.jpg?v=aaa"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.72)_0%,rgba(7,8,12,0.42)_40%,rgba(7,8,12,0.86)_100%)]" />
      <div className="relative z-10 flex min-h-dvh flex-col px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.6rem,env(safe-area-inset-bottom))]">
        <a
          href="/"
          className="self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
          style={{ touchAction: "manipulation" }}
        >
          Back
        </a>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Coffre</p>
        <h1 className="mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
          Keep the hall
        </h1>
        <p className="mt-3 max-w-xs font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          hung films and citadels stay yours. nobody else can overwrite the coffre.
        </p>
        <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
          {isPending ? (
            <>
              <div className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              <div className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
            </>
          ) : user ? (
            <Navigate to="/" />
          ) : authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="flex h-14 items-center justify-center rounded-2xl border border-[#e4c37a]/40 bg-black/55 font-display text-2xl text-[#f0d48a]"
                style={{ touchAction: "manipulation" }}
              >
                Continue with {p.label}
              </button>
            ))
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">Sign-in is disabled.</p>
          )}
        </div>
      </div>
    </main>
  );
}
