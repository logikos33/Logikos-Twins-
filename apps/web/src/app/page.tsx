import Link from "next/link";

/**
 * Galeria de scans. Na D0 é só a casca — a listagem real e as miniaturas chegam na D4,
 * e a proteção por ADMIN_TOKEN na D7.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Logikos Twins</h1>
        <p className="mt-3 text-pretty text-neutral-400">
          Filme um ambiente andando com o celular. Minutos depois, abra o mapa 3D
          navegável daquele lugar — com medição, anotações e detecções ancoradas no
          espaço.
        </p>
      </div>

      <Link
        href="/new"
        className="inline-flex w-fit items-center rounded-full bg-white px-6 py-3 font-medium text-neutral-950 transition hover:bg-neutral-200"
      >
        Novo scan
      </Link>

      <p className="text-sm text-neutral-500">A galeria de scans aparece aqui na D4.</p>
    </main>
  );
}
