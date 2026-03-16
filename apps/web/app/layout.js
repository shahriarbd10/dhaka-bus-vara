import Link from "next/link";
import { BusFront, Route, ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata = {
  title: "Bus Vara | Dhaka Fare Intelligence",
  description: "Premium Dhaka transport fare platform with chart-synced data and secure admin publishing"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />

        <header className="site-header">
          <div className="site-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                <BusFront size={18} />
              </span>
              <span className="brand-copy">
                <strong>Bus Vara</strong>
                <small>Dhaka Fare Intelligence</small>
              </span>
            </Link>

            <nav className="site-nav" aria-label="Main">
              <Link href="/" className="nav-link">
                <Route size={16} />
                <span>Fare Finder</span>
              </Link>
              <Link href="/admin" className="nav-link">
                <ShieldCheck size={16} />
                <span>Admin</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="page-wrap">{children}</main>
      </body>
    </html>
  );
}
