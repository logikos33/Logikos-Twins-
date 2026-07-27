import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// As três vozes do Manual da Marca (Space Grotesk · Inter · JetBrains Mono) como
// woff2 VARIÁVEIS locais — extraídas do próprio manual. `next/font/local` não toca
// a rede: o build continua offline (mesma garantia da pilha de sistema anterior).
const spaceGrotesk = localFont({
  src: "../fonts/SpaceGrotesk[wght]-latin.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});
const inter = localFont({
  src: "../fonts/Inter[wght]-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono[wght]-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 800",
  display: "swap",
});

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
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
