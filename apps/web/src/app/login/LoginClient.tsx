"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoWordmark } from "@/components/Logo";
import { IconAlert, IconBack, IconEye, IconEyeOff, IconMail } from "@/components/icons";

/**
 * /login — rota ESTÁTICA de design (ajuste ao contrato nº 8 do briefing): a tela
 * existe e está pronta para receber autenticação no futuro, mas NÃO valida nada —
 * o submit apenas encena carregando → erro. O login nunca entra na frente do fluxo
 * da demo: quem recebe um link de scan não precisa de conta.
 */

type View = "form" | "loading" | "error" | "forgot" | "sent";

export function LoginClient() {
  const [view, setView] = useState<View>("form");
  const [showPwd, setShowPwd] = useState(false);
  const [email2, setEmail2] = useState("");

  const busy = view === "loading";

  function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setView("loading");
    // Sem backend de auth por enquanto: a rota é estática (ver docstring).
    setTimeout(() => setView("error"), 1400);
  }

  function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setView("sent");
  }

  const inForgot = view === "forgot" || view === "sent";

  return (
    <main className="grid-grego relative flex min-h-dvh flex-col items-center justify-center px-5 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(0_229_255/0.06),transparent)]"
      />

      <LogoWordmark className="relative text-[22px]" />

      <div className="relative mt-6 w-full max-w-[400px] overflow-hidden rounded-xl border border-line bg-graphite p-6 shadow-card">
        {!inForgot ? (
          <>
            <h1 className="font-display text-[23px] font-bold">Entrar</h1>
            <p className="mt-1 mb-4 text-[13px] leading-relaxed text-mist">
              Acesso do <b className="font-medium text-signal">operador</b> — galeria
              completa e painel. Quem recebe um link de scan não precisa de conta.
            </p>

            {view === "error" && (
              <div
                role="alert"
                className="mb-4 flex gap-2.5 rounded-[10px] border border-line border-l-[3px] border-l-magenta bg-surface-2 px-3 py-2.5 text-[13px] motion-safe:animate-[shake_0.3s_steps(4,end)_1]"
              >
                <IconAlert className="mt-0.5 h-[18px] w-[18px] flex-none text-magenta" />
                <span>
                  <b className="block font-semibold text-danger-soft">
                    E-mail ou senha não conferem.
                  </b>
                  <span className="text-mist">Confira os dados e tente de novo.</span>
                </span>
              </div>
            )}

            <form onSubmit={submitLogin} noValidate>
              <label
                className="mb-1.5 block text-[13px] font-medium text-mist"
                htmlFor="email"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="voce@empresa.com.br"
                disabled={busy}
                className={`mb-3.5 h-[50px] w-full rounded-md border bg-surface-2 px-3.5 text-[15px] outline-none transition placeholder:text-faint focus:border-cyan disabled:opacity-55 ${
                  view === "error" ? "border-magenta/55" : "border-line"
                }`}
              />
              <label
                className="mb-1.5 block text-[13px] font-medium text-mist"
                htmlFor="pwd"
              >
                Senha
              </label>
              <div className="relative mb-1">
                <input
                  id="pwd"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={busy}
                  className={`h-[50px] w-full rounded-md border bg-surface-2 pr-13 pl-3.5 text-[15px] outline-none transition placeholder:text-faint focus:border-cyan disabled:opacity-55 ${
                    view === "error" ? "border-magenta/55" : "border-line"
                  }`}
                />
                <button
                  type="button"
                  aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute top-1/2 right-1 grid h-(--tap) w-(--tap) -translate-y-1/2 place-items-center rounded-[10px] text-mist hover:text-signal"
                >
                  {showPwd ? (
                    <IconEyeOff className="h-5 w-5" />
                  ) : (
                    <IconEye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <div className="mb-3.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setView("forgot")}
                  className="inline-flex min-h-(--tap) items-center px-1.5 text-[13px] text-mist underline decoration-dotted underline-offset-2 hover:text-cyan"
                >
                  Esqueci a senha
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-md bg-cyan font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.98] disabled:opacity-75"
              >
                {busy && (
                  <span className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px] border-ink/25 border-t-ink motion-reduce:animate-none" />
                )}
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
          </>
        ) : view === "forgot" ? (
          <>
            <button
              onClick={() => setView("form")}
              className="mb-1 inline-flex min-h-(--tap) items-center gap-1.5 pr-2 text-sm text-mist hover:text-signal"
            >
              <IconBack className="h-[18px] w-[18px]" />
              voltar
            </button>
            <h1 className="font-display text-[23px] font-bold">Redefinir senha</h1>
            <p className="mt-1 mb-4 text-[13px] leading-relaxed text-mist">
              Informe o e-mail da sua conta de operador. Enviaremos um link de
              redefinição.
            </p>
            <form onSubmit={submitForgot} noValidate>
              <label
                className="mb-1.5 block text-[13px] font-medium text-mist"
                htmlFor="email2"
              >
                E-mail
              </label>
              <input
                id="email2"
                type="email"
                autoComplete="username"
                placeholder="voce@empresa.com.br"
                value={email2}
                onChange={(e) => setEmail2(e.target.value)}
                className="mb-4 h-[50px] w-full rounded-md border border-line bg-surface-2 px-3.5 text-[15px] outline-none transition placeholder:text-faint focus:border-cyan"
              />
              <button
                type="submit"
                className="min-h-[50px] w-full rounded-md bg-cyan font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.98]"
              >
                Enviar link de redefinição
              </button>
            </form>
          </>
        ) : (
          <div className="py-2 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border-[1.5px] border-success/50">
              <IconMail className="h-7 w-7 text-success" />
            </span>
            <h2 className="mt-3.5 font-display text-lg font-medium">
              Verifique seu e-mail
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
              Se{" "}
              <b className="font-medium text-signal">
                {email2.trim() || "voce@empresa.com.br"}
              </b>{" "}
              tiver uma conta de operador, o link de redefinição chega em instantes.
            </p>
            <button
              onClick={() => setView("form")}
              className="mt-4 min-h-[48px] w-full rounded-md border border-line-strong font-semibold transition hover:border-cyan"
            >
              Voltar para o login
            </button>
          </div>
        )}
      </div>

      <p className="relative mt-4 max-w-[340px] text-center text-[12.5px] leading-relaxed text-mist">
        O login <b className="font-medium text-signal">nunca é exigido</b> para ver um
        scan compartilhado — o link com token continua sendo a chave.
      </p>
      <Link
        href="/"
        className="relative mt-1 inline-flex min-h-(--tap) items-center px-2.5 font-mono text-xs text-faint hover:text-mist"
      >
        ← voltar para a home
      </Link>
    </main>
  );
}
