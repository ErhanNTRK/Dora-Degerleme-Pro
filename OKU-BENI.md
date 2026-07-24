# Toplu Excel İçe Aktarma — Dora Değerleme Pro Yükleme Paketi

Doğrulama (bu paketin çıktığı kopyada): `npx tsc -b` → 0 hata ·
`npm run test` → **78/78** (mevcut 70 + yeni 8) · `npm run build` → başarılı.
Hesaplama motoruna (src/engine) DOKUNULMAMIŞTIR.

## Dosyalar

YENİ:
- src/bulk/excelImport.ts        → içe aktarma çekirdeği (saf, React'siz)
- src/bulk/excelImport.test.ts   → 8 regresyon testi
- src/pages/BulkImportPage.tsx   → "Excel'den Rapor Oluştur" sayfası (/toplu-yukleme)

ÜZERİNE YAZILACAK (minimal diff):
- src/App.tsx                    → yalnız yeni route (2 satır)
- src/components/Layout.tsx      → alt menüye "Excel" bağlantısı (1 blok)
- src/pages/MultiProposalPage.tsx→ DRAFT_KEY artık src/bulk'tan gelir (tek doğruluk kaynağı; davranış aynı)
- src/App.css                    → yalnız dosya sonuna toplu-yükleme stilleri
- package.json / package-lock.json → yeni bağımlılık: xlsx (Excel okumak için; cihazda çalışır, dosya hiçbir yere gönderilmez)

## Yükleme
GitHub → Dora-Degerleme-Pro → Add file → Upload files → zip içindeki `src`
klasörünü + package.json + package-lock.json sürükleyip bırak → Commit.
Sonra her zamanki gibi build alıp yayın reposuna (Dora-SPK-Tarife) aktarın.
Not: `npm install` bir kez çalıştırılmalı (xlsx paketi için).

## Akış
Excel yükle → kolonlar otomatik algılanır (İL/İLÇE/MAHALLE/ADA/PARSEL/TAPU
NİTELİĞİ/ALAN; başlık adları esnek, elle düzeltilebilir) → satırlar il+ilçe+
mahalle+niteliğe göre RAPORLARA gruplanır → satırlar raporlar arasında
taşınabilir, tür/alan düzeltilebilir → her rapor için OFİS maliyet dökümü
(tarife + toplu değerleme indirimi + tapu + belediye harcı [Arsa/Tarla'da
uygulanmaz] + ulaşım/TDUB/bilgi merkezi) → ONAYLA → mevcut Çoklu Teklif
ekranına taslak olarak düşer; teklif orada KDV hariç tutar + %20 KDV ile üretilir.
