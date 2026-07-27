# Toplu Excel v2 — Akıllı Teklif Hazırlama Ekranı (Yükleme Paketi)

Doğrulama (bu paketin çıktığı kopyada): `npx tsc -b` → 0 hata ·
`npm run test` → **112/112** (önceki 78 + yeni 34) · `npm run build` → başarılı ·
oxlint (bu paketin dosyaları) → 0 hata. Hesaplama motoruna (src/engine)
DOKUNULMAMIŞTIR. v1 Toplu Excel'in üzerine gelir; rota ve menü aynıdır
(/toplu-yukleme — "Excel"), ikinci bir ekran doğmaz.

## Dosyalar

YENİ:
- src/bulk/fuzzy.ts (+test)            → TR katlama + Levenshtein; belirsizlikte dayatmaz
- src/bulk/smartGroupCost.ts (+test)   → tebliğe uygun alt küme maliyeti (G1 mahalle / G2 ada-parsel)
- src/bulk/smartParse.test.ts          → 3 gerçek müşteri formatının ANONİM golden testleri
- public/data/mahalle-database.json    → 49.621 mahalle → ilçe sözlüğü (0,77 MB, çevrimdışı;
                                         kaynak: github.com/nejdetkadir/il-ilce-semt-mahalleler, MIT)

ÜZERİNE YAZILACAK:
- src/bulk/excelImport.ts              → v2 akıllı katman (v1 API'si korunur)
- src/pages/BulkImportPage.tsx         → v2 ekran (aşağıda)
- src/proposal/multiProposalRows.ts    → tek ekleme: titleDeedCountOverride (tapu adedi ezmesi;
                                         null iken davranış birebir eski — regresyonlar geçti)
- src/App.css                          → yalnız dosya sonuna v2 stilleri

## v2 neler yapar
- Başlık satırını KENDİSİ bulur (2.-3. satırda olsa da); müşteri unvanını üst
  satırdan yakalar ve düzenlenebilir alana koyar.
- Kolonları başlık + İÇERİK analiziyle tanır ("Semt" başlıklı kolonun mahalle
  olduğunu değerlerden anlar; sıra-numarası kolonunu alan sanmaz).
- Yazım hatalarını fuzzy düzeltir: istanbul→İSTANBUL, Besiktas→BEŞİKTAŞ,
  "ALAÇATI M"→ALAÇATI (✎ rozetiyle gösterir; iki aday başa başsa DAYATMAZ).
- Birleşik "ADA/PARSEL" (1343/151, __/4544), "Eski 0 Yeni 2344" (Yeni esas),
  nitelik içindeki gömülü m² ("741,00 m2 arsa") çözülür; boş konumlu devam
  satırları üstten miras alır (⤷ işareti).
- Tapu Türü eşlemesi: Kat Mülkiyeti→G2-T1; Cins Tashihi + konut→G2-T2; nitelik
  konut değilse MAHAL NİTELİĞİ belirler. Öneri asla kilitli değildir.
- Rapor grubu İLÇE bazlıdır (Caferağa+Moda tek rapor); toplu değerleme indirimi
  tebliğe uygun ALT KÜMELERDE hesaplanır ve motorla doğrulanmıştır.
- İlçe hiç yoksa AYNI MAHALLE varsayılır (ekranda açık uyarı). Yalnız mahalle
  yazan listelerde mahalle sözlüğü ilçeyi bulur (Levent→BEŞİKTAŞ); mahalle
  birden çok ilçedeyse seçim kullanıcıya bırakılır.
- Her rapor kartında maliyet kalemleri AYRI satırlar: tarife bedeli (indirim
  ayrıca görünür) · tapu (ADET ELLE DEĞİŞTİRİLEBİLİR — TAKBİS kuralı) · belediye
  harcı (otomatik/elle/sıfır) · ulaşım · TDUB · bilgi merkezi (her biri aç/kapat).
- Satırlar sürükle-bırak veya seçiciyle taşınır; "buraya bırak → yeni rapor"
  alanı vardır; gruplar birleştirilir/silinir; ↺ önerilen gruplamaya döner.
- Onayla → Çoklu Teklif kompozerine taslak düşer (kalem ayarları ve tapu adedi
  hesaplara birebir taşınır; müşteri unvanı doldurulur). Teklif: KDV hariç
  tutar + KDV %20 = genel toplam; maliyet dökümü ofis görünümünde.

## Yükleme
GitHub → Dora-Degerleme-Pro → Add file → Upload files → zip içindeki `src` ve
`public` klasörlerini sürükleyip bırak → Commit. (xlsx bağımlılığı v1'de
eklenmişti; yeni bağımlılık yoktur.) Sonra her zamanki gibi build alıp yayın
reposuna aktarın.
