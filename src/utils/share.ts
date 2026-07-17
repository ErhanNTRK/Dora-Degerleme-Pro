/**
 * Bir dosyayı, tarayıcı destekliyorsa yerel paylaşım (Web Share API) menüsüyle paylaşır
 * (mobilde WhatsApp dahil tüm uygulamalar listelenir). Desteklenmiyorsa dosyayı indirir.
 */
export async function shareOrDownloadFile(blob: Blob, fileName: string, mimeType: string, shareText?: string) {
  try {
    const file = new File([blob], fileName, { type: mimeType });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: ShareData) => Promise<void> };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: fileName, text: shareText });
      return { method: 'share' as const };
    }
  } catch {
    // Kullanıcı paylaşım penceresini iptal etmiş veya desteklenmiyor olabilir; indirmeye düş.
  }
  downloadBlob(blob, fileName);
  return { method: 'download' as const };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** WhatsApp'ta yalnızca metin paylaşımı için (dosya eki gerektirmeyen hızlı paylaşım). */
export function shareTextToWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
