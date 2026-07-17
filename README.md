# Dora Değerleme Pro — Profesyonel Değerleme ve Teklif Yönetim Sistemi

Dora Gayrimenkul Değerleme A.Ş. ortaklarının sahada, ofis dışında, birkaç dakika içinde Asgari
Hizmet Bedeli hesaplayıp müşteriye Fiyat Teklifi (PDF/Word) oluşturup WhatsApp üzerinden
gönderebilmesi için geliştirilmiş, çevrimdışı çalışabilen kurumsal bir PWA.

## Fiyatlandırma mantığı (en son revizyon — kritik)

Uygulamada birbirinden tamamen bağımsız **3 tutar** vardır:

1. **Asgari Hizmet Bedeli** — 2026 SPK tarifesine göre hesaplama motorundan gelir, hiçbir zaman
   değişmez (`computeAsgariHizmetBedeli`, motoru hiç değiştirmez).
2. **Toplam Maliyet** — Asgari Hizmet Bedeli + Tapu Harcı + Belediye Harcı + Yol Ücreti + TDUB
   Birlik Payı + Gayrimenkul Bilgi Merkezi Payı + Diğer Harçlar. Tamamen otomatik hesaplanır;
   kullanıcı müdahale etmez. (Motorun zaten hesapladığı `result.subtotal` ile birebir aynıdır,
   ayrı bir hesaplama eklenmedi.)
3. **Teklif Bedeli** — Varsayılan olarak Toplam Maliyet'e eşittir, kullanıcı serbestçe
   değiştirebilir. Bu değişiklik Asgari Hizmet Bedeli'ni ve Toplam Maliyet'i kesinlikle etkilemez.

Sonuç ekranında (şirket içi görünüm) bu 3 tutar + KDV + Genel Toplam sırasıyla gösterilir; harç
kalemlerinin dökümü "Maliyet Detayı (Ofis Kaydı)" adlı kapalı bir accordion'dadır.

**Müşteriye giden Teklif Yazısı, Teklif PDF ve Word'de yalnızca Teklif Bedeli (Hizmet Bedeli
olarak adlandırılır) + KDV gösterilir.** Tapu harcı, belediye harcı, yol ücreti, TDUB Birlik Payı,
Gayrimenkul Bilgi Merkezi Payı ve diğer harçlar bu belgelerde **hiçbir zaman** yer almaz — bu,
otomatik bir testle ("Teklif metninde sızan iç kalemler: YOK") doğrulanmıştır.

## Önceki revizyonlarda gelenler

- Yeni Hesaplama: Taşınmaz Bilgileri önce, Müşteri Bilgileri isteğe bağlı accordion.
- Tapu Sayısı taşınmaz sayısına otomatik eşitlenir (manuel değiştirilebilir).
- Taşınmaz ek bilgileri (Mahalle/Ada/Parsel/Pafta/Bağımsız Bölüm/Açık Adres), Müşteri Türü
  (Bireysel/Kurumsal → otomatik hitap), otomatik taşınmaz özeti, tutarın yazıyla gösterimi,
  otomatik dosya adı, Teklif Alt Notu, Teklif Tarihi, tek satır Kopyala ("… TL + KDV"), Geçmiş
  arama, Belediye Harçları'nda son güncelleme tarihi, Belge Önizleme modalı.
- İl/İlçe veritabanı (81 il, 973 ilçe), belediye harcı otomasyonu, Firma Profili, GitHub Pages +
  PWA desteği.

**Hesaplama motoruna (`src/engine/`) hiçbir revizyonda dokunulmamıştır.**

## Mimari

- **Hesaplama Motoru** (`src/engine/`) — dokunulmadı.
- **Teklif Katmanı** (`src/proposal/`) — `computeProposalPricing(offerAmount, vatRatePercent)`
  yalnızca Teklif Bedeli ve KDV oranını kullanır; Asgari Hizmet Bedeli/Toplam Maliyet'ten tamamen
  bağımsızdır.
- **Tarife ve İl/İlçe Verisi** — değişmedi.

## Doğrulama

- Toplam Maliyet = Asgari Hizmet Bedeli + tüm harçlar (motor + yeni mantık karşılaştırmalı test
  edildi, `result.subtotal` ile birebir eşleşiyor).
- Teklif Bedeli varsayılanı Toplam Maliyet'e eşit; kullanıcı değiştirdiğinde Asgari Hizmet Bedeli
  ve Toplam Maliyet değişmiyor (testle doğrulandı).
- Teklif metninde iç kalemlerin (Tapu Harcı, Belediye Harcı, TDUB Birlik, Bilgi Merkezi, Ulaşım/Yol
  Ücreti) hiçbirinin geçmediği otomatik test edildi.
- Regresyon: motor hesap sonuçları önceki sürümle birebir aynı.

## Yerel geliştirme / Build / GitHub Pages

Önceki README bölümleri (kurulum, `npm run build`, GitHub Pages `BASE_PATH`, İl/İlçe Excel
güncelleme script'i) aynen geçerlidir.

