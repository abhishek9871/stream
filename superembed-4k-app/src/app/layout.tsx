import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "SuperEmbed 4K - Premium Streaming",
  description: "Experience cinema-grade streaming with our advanced Native HLS player.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="font-body bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
