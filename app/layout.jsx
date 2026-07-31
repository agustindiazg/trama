import "./globals.css";

export const metadata = {
  title: "Trama — CVs que atraviesan filtros",
  description: "Transformá tu CV en PDF a un documento LaTeX limpio y compatible con ATS."
};

export const viewport = {
  themeColor: "#f5f0e8",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>;
}
