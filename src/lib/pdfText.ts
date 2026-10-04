import * as pdfjs from 'pdfjs-dist'
import { groupLines, type PdfTextItem } from './invoicePdf'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Lấy chữ trong PDF, ghép lại theo từng dòng (cùng độ cao trên trang). */
// Đọc HẾT các trang (tối đa 10): có hóa đơn dài 3 trang, dòng tổng tiền nằm ở trang cuối
export async function pdfToLines(buf: ArrayBuffer, maxPages = 10): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const lines: string[] = []
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    lines.push(...groupLines(content.items.filter((i) => 'str' in i) as PdfTextItem[]))
  }
  return lines
}
