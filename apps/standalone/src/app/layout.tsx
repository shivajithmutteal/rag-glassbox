import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Glass-box RAG',
  description: 'A retrieval-augmented-generation demo that makes the retrieval step visible.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
