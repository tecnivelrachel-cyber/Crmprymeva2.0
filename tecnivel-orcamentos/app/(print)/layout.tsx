import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = { title: 'Impressão' }

/**
 * Layout sem cabeçalho, menu ou barra inferior: o que estiver aqui é o que sai
 * na impressora. A única exceção é a barra de ações, marcada com .no-print.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="bg-slate-100 font-sans print:bg-white" style={{ paddingBottom: 0 }}>
        {children}
      </body>
    </html>
  )
}
