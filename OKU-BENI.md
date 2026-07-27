# Toplu Excel v3 — Saf Tebliğ + Tam Kullanıcı Kontrolü (Yükleme Paketi)

Doğrulama: `npx tsc -b` → 0 hata · `npm run test` → **119/119** ·
`npm run build` → başarılı · oxlint (paket dosyaları) → 0 hata.
Hesaplama motoruna (src/engine) DOKUNULMAMIŞTIR. v2'nin üzerine gelir;
rota ve menü aynıdır (/toplu-yukleme — "Excel").

## Kurallar (2026-07-26 oturumunda netleşen haliyle)
- İLK ÖNERİ TAMAMEN 2026 TARİFESİNE GÖREDİR: G1 (arsa/tarla) yalnız aynı
  il+ilçe+MAHALLEDE, G2 (bağımsız bölüm/müstakil) yalnız aynı ADA/PARSELDE
  kendiliğinden gruplanır; diğer her şey TAŞINMAZ BAŞINA AYRI RAPOR
  (2 ayrı parselde 2 fabrika + arsa + tarla → 4 ayrı kart).
- BİRLEŞTİRME KULLANICININ HAKKIDIR (villa+arsası, 4-parsel-tek-kullanım gibi
  özel raporlar): sürükle-bırak/seçici ile satırlar taşınır; sistem engellemez,
  "özel rapor" rozetiyle işaretler. "tebliğ" rozeti koşulu kendiliğinden
  sağlayan grupları gösterir.
- YÜZDE MODELİ: her taşınmazın TABAN ücreti kendi tarifesinden hesaplanır;
  çok taşınmazlı raporda en yüksek taban %100, diğerleri G2 %15 · G1 %20 ·
  tebliğde oranı olmayanlar %20 önerilir. HER SATIRDA yüzde kutusu serbesttir
  (%100, %50…); ↺ önerilene döner.
- BELEDİYE HARCI TAŞINMAZ BAŞINA ayrı satırdır: G1'de uygulanmaz, diğerlerinde
  ilçe kaydından gelir; elle değiştirilebilir/sıfırlanabilir, asla zorunlu değildir.
- TAPU HARCI TAŞINMAZ BAŞINA BİRER gelir; her satırda artırılıp azaltılabilir
  ("TAKBİS almayın" → 0).
- YOL / TDUB / BİLGİ MERKEZİ rapor başına TEK'tir; kapatılabilir/sıfırlanabilir.
- TEKLİF TUTARI rapor başına elle ezilebilir (pazarlıklı fiyat); ofis maliyet
  dökümü yine görünür; KDV teklif tutarı üzerinden yürür.
- MAHALLE/ADA/PARSEL hücreleri elle yazılabilir; elle yazılan esastır,
  fuzzy/sözlük üstüne dayatmaz.
- NİTELİK FUZZY'Sİ: TARLLLA→Tarla, OFŞS→Ofis, ARSAA→Arsa (Levenshtein;
  belirsizlikte dayatma yok, "Tür seçiniz" uyarısı).
- Aktarım: tek taşınmazlı ve ezmesiz raporlar Çoklu Teklif'e motora birebir
  gider; çok taşınmazlı/yüzdeli/ezmeli raporlar tebliğ-üstü tutarlarıyla
  sabitlenmiş satır olarak düşer (tek belediye/yol/TDUB/bilgi mantığı korunur).
  Teklifte KDV hariç tutar + KDV %20 = genel toplam; döküm ofis görünümünde.

## Dosyalar
YENİ: src/bulk/reportCost.ts (+test — villa+arsa, %50 ezmesi, TAKBİS=0,
teklif ezmesi goldenleri). ÜZERİNE: src/bulk/excelImport.ts (saf tebliğ
gruplama + nitelik fuzzy), src/bulk/smartParse.test.ts, src/pages/
BulkImportPage.tsx (v3 ekran), src/App.css (sona v3 stilleri). v2 ile gelen
diğer dosyalar (fuzzy, smartGroupCost, mahalle-database, multiProposalRows)
pakete tam set olarak yeniden kondu — eksik yükleme riskine karşı hepsini
sürükleyin, aynı olanların üzerine yazılması zararsızdır.

## Yükleme
GitHub → Dora-Degerleme-Pro → Add file → Upload files → `src` ve `public`
klasörlerini sürükleyip bırak → Commit → build → yayın reposuna aktar.
Yeni bağımlılık yoktur.
