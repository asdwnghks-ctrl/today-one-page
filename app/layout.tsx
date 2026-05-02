import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘도 한 페이지",
  description: "둘이서 함께, 천천히 성서를 읽고 일상을 나누는 공간.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="soft-shell min-h-screen">{children}</div>
      </body>
    </html>
  );
}
