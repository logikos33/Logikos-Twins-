import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PDF do marcador ArUco (DICT_4X4_50, id 0) para impressão em A4.
 *
 * O PDF é gerado à mão — o formato para "retângulos pretos numa página" é trivial e
 * uma biblioteca inteira de PDF só para isso violaria o custo mínimo. O marcador é
 * desenhado com 150 mm de lado (o valor que o worker usa em ARUCO_MARKER_SIDE_M);
 * a página instrui a NÃO redimensionar na impressão.
 */

// Bitmap congelado do DICT_4X4_50 id 0 (1 = célula branca) — o mesmo da fixture.
const BITMAP = [
  [0, 0, 0, 0, 0, 0],
  [0, 1, 0, 1, 1, 0],
  [0, 0, 1, 0, 1, 0],
  [0, 0, 0, 1, 1, 0],
  [0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0],
];

const MM = 72 / 25.4; // pontos PDF por milímetro
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const SIDE = 150 * MM;
const CELL = SIDE / 6;

function buildPdf(): Uint8Array {
  const originX = (PAGE_W - SIDE) / 2;
  const originY = (PAGE_H - SIDE) / 2;

  let content = "";
  // Células pretas do marcador (a página já é branca).
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (BITMAP[r]![c] === 0) {
        // PDF tem origem no canto INFERIOR esquerdo; a linha 0 do bitmap é o topo.
        const x = originX + c * CELL;
        const y = originY + (5 - r) * CELL;
        content += `${x.toFixed(2)} ${y.toFixed(2)} ${CELL.toFixed(2)} ${CELL.toFixed(2)} re f\n`;
      }
    }
  }
  // Instruções (fonte padrão Helvetica).
  // ASCII puro: acentos em string literal de PDF exigiriam escapes octais do
  // encoding do Type1 — complexidade sem retorno para 4 linhas de instrução.
  const title = "Logikos Twins - marcador de escala (ArUco 4x4, id 0)";
  const lines = [
    "Imprima em A4 SEM ajustar a escala (100%, nao use 'ajustar a pagina').",
    "O lado do quadrado preto deve medir exatamente 150 mm.",
    "Deixe a folha PLANA no chao, visivel por alguns segundos da filmagem.",
    "O mapa 3D sai calibrado em metros automaticamente.",
  ];
  content += "BT /F1 14 Tf 40 800 Td (" + title + ") Tj ET\n";
  lines.forEach((line, i) => {
    content += `BT /F1 10 Tf 40 ${780 - i * 16} Td (${line}) Tj ET\n`;
  });

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  );
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function GET() {
  return new NextResponse(Buffer.from(buildPdf()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="logikos-twins-marcador.pdf"',
    },
  });
}
