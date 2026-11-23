/**
 * PDF / Word üreticileri (jsPDF, docx — uygulamanın en ağır parçaları) yalnızca
 * kullanıcı belge indirmek istediğinde yüklenir; böylece uygulama telefonda hızlı açılır.
 * Fonksiyonlar özgün üreticilerle aynı parametreleri alır, yalnızca asenkrondur.
 */
import type { buildProposalPdfBlob as BuildProposalPdfBlob } from './generateProposalPdf';
import type { buildProposalDocxBlob as BuildProposalDocxBlob } from './generateProposalDocx';
import type { generateReportPdf as GenerateReportPdf, buildReportPdfBlob as BuildReportPdfBlob } from '../pdf/generateReportPdf';

export async function buildProposalPdfBlobLazy(...args: Parameters<typeof BuildProposalPdfBlob>) {
  const m = await import('./generateProposalPdf');
  return m.buildProposalPdfBlob(...args);
}

export async function buildProposalDocxBlobLazy(...args: Parameters<typeof BuildProposalDocxBlob>) {
  const m = await import('./generateProposalDocx');
  return m.buildProposalDocxBlob(...args);
}

export async function generateReportPdfLazy(...args: Parameters<typeof GenerateReportPdf>) {
  const m = await import('../pdf/generateReportPdf');
  return m.generateReportPdf(...args);
}

export async function buildReportPdfBlobLazy(...args: Parameters<typeof BuildReportPdfBlob>) {
  const m = await import('../pdf/generateReportPdf');
  return m.buildReportPdfBlob(...args);
}

/**
 * Belge üreticilerini önceden indirir (sonuç önbellekte kalır). Paylaşma düğmesine basıldığında
 * ağ beklemesi olmasın diye, kullanıcı önizleme/geçmiş ekranını açtığında çağrılır; böylece
 * tarayıcının "kullanıcı dokunuşu" süresi içinde paylaşım penceresi açılabilir.
 */
export function preloadDocs(): void {
  void import('./generateProposalPdf').catch(() => undefined);
  void import('./generateProposalDocx').catch(() => undefined);
}
