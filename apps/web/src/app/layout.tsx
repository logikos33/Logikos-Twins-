import type { Metadata, Viewport } from "next";
import "./globals.css";

// Sem `next/font/google`: baixar fonte em tempo de build acopla o build à rede e
// quebra tanto a CI offline quanto o build da imagem. A pilha de fontes do sistema
// resolve bem e carrega instantaneamente no celular.

export const metadata: Metadata = {
  title: "Logikos Twins",
  description:
    "Filme um ambiente com o celular e receba um mapa 3D navegável, com medição, anotações e detecções ancoradas no espaço.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A captura e o viewer ocupam a tela inteira no celular; os controles não podem
  // ficar embaixo da barra do navegador.
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
