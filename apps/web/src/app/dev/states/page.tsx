import { notFound } from "next/navigation";
import { StateChip } from "@/components/piloto/StateChip";
import { devStatesEnabled } from "@/lib/piloto/dev-flag";
import { STRINGS } from "@/lib/piloto/strings";
import { EntryClient } from "@/app/entry/EntryClient";
import { CaptureView, type CaptureState } from "@/app/new/CaptureView";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/piloto/error-codes";
import { PROCESSING_STAGES, type JobState } from "@/lib/piloto/job-state";

/**
 * /dev/states — galeria de TODOS os estados do contrato (gate da Camada B:
 * cada data-state renderiza aqui sem erro de console). Dados fake do export
 * do Design (projeto "Galpão Vila Anchieta", job TWN-8F3K). SÓ EM DEV — em
 * produção é 404 (guard puro testado em dev-flag.test.ts).
 */

export const dynamic = "force-dynamic";

const FAKE_STATES: JobState[] = [
  { kind: "uploading", sentParts: 7 },
  { kind: "upload-paused-offline", sentParts: 7 },
  { kind: "queued" },
  ...PROCESSING_STAGES.map((stage) => ({ kind: "processing", stage }) as JobState),
  { kind: "completed" },
  { kind: "failed", code: "processing-failed" },
  { kind: "cancelled" },
];

const ENTRY_STATES = ["loading", "ready", "empty", "invalid-link", "offline"] as const;
const ENTRY_MAPS = [
  { id: "m1", name: "Piso térreo", date: "2026-08-12", st: "done", href: "#" },
  { id: "m2", name: "Mezanino", date: "2026-09-02", st: "processing", href: "#" },
  { id: "m3", name: "Doca 3", date: "2026-09-01", st: "failed", href: "#" },
] as const;

function mockLabel(): string {
  return STRINGS.common.mock.toUpperCase();
}

export default function DevStatesPage() {
  if (!devStatesEnabled()) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-mist">
          dev · galeria de estados do contrato v1.1
        </p>
        <h1 className="text-xl font-semibold">Galpão Vila Anchieta</h1>
        <p className="font-mono text-sm text-mist">job TWN-8F3K</p>
      </header>

      <section data-screen="job">
        <h2 className="mb-3 text-sm font-semibold text-mist">jobStates</h2>
        <ul className="space-y-2">
          {FAKE_STATES.map((s, i) => (
            <li key={`${s.kind}-${"stage" in s ? s.stage : i}`} className="flex items-center gap-3">
              <StateChip kind={s.kind} stage={"stage" in s ? s.stage : undefined} />
              <code className="text-xs text-faint">{JSON.stringify(s)}</code>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-mist">tela entry — 5 estados</h2>
        <div className="space-y-6">
          {ENTRY_STATES.map((st) => (
            <div key={st}>
              <p className="mb-1 font-mono text-xs text-faint">entry · {st}</p>
              <div className="h-[520px] overflow-hidden rounded-xl border border-line">
                <EntryClient
                  state={st}
                  projectName="Galpão Vila Anchieta"
                  maps={[...ENTRY_MAPS]}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-mist">tela capture — 8 estados</h2>
        <div className="space-y-6">
          {(
            [
              "permission-prompt",
              "permission-denied",
              "unsupported",
              "https-required",
              "idle",
              "recording",
              "stopping",
              "portrait-hint",
            ] as CaptureState[]
          ).map((st) => (
            <div key={st}>
              <p className="mb-1 font-mono text-xs text-faint">capture · {st}</p>
              <div className="h-[560px] overflow-hidden rounded-xl border border-line">
                <CaptureView
                  state={st}
                  elapsedS={st === "stopping" ? 120 : 42}
                  maxSeconds={120}
                  partsSent={5}
                  partsQueued={1}
                  instrOpen={false}
                  blurFaces
                  onStart={() => undefined}
                  onStop={() => undefined}
                  onTorch={() => undefined}
                  onFallback={() => undefined}
                  onAllow={() => undefined}
                  onDismissHint={() => undefined}
                  onToggleInstr={() => undefined}
                  onToggleBlur={() => undefined}
                  camSlot={
                    <div className="relative h-full w-full bg-[color:var(--color-surface-2)]">
                      <span className="k-label absolute top-4 right-4 text-[10px] text-faint">
                        {mockLabel()}
                      </span>
                    </div>
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section data-screen="errors">
        <h2 className="mb-3 text-sm font-semibold text-mist">errorCodes</h2>
        <ul className="space-y-2">
          {ERROR_CODES.map((code) => (
            <li key={code}>
              <p className="font-mono text-xs text-danger-soft">{code}</p>
              <p className="text-sm">{ERROR_MESSAGES[code]}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
