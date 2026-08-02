import "./globals.css";

export const metadata = {
  title: "Trama — Tu experiencia, mejor presentada",
  description: "Mejorá tu CV para que los sistemas de selección puedan leerlo mejor y aumentá tus posibilidades de llegar a una entrevista."
};

export const viewport = {
  themeColor: "#f5f0e8",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>;
}
