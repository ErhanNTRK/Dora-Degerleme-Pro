# ✨ DORA AKILLI TEKLİF — GRAND FINALE ✨
## Toplu Excel'in nihai sürümü: tüm bilinen sorunlar çözülmüş tek paket

Doğrulama: `npx tsc -b` → 0 hata · `npm run test` → **121/121** ·
`npm run build` → başarılı · oxlint (paket dosyaları) → 0 hata.
Hesaplama motoruna (src/engine) DOKUNULMAMIŞTIR. v3'ün üzerine gelir;
rota ve menü aynıdır (/toplu-yukleme — "Excel"). Yeni bağımlılık yoktur.

## Bu finalde çözülenler (son iki not + tam tarama)

1) BELEDİYE HARCI ARTIK PARSEL BAŞINA BİR KEZ: aynı ada/parseldeki
   taşınmazlar (örn. bir apartmandaki 5 daire) için harç tek satırda görünür;
   parselin ilk satırı taşır, diğerleri "aynı parsel — harç yukarıda" der.
   Karma raporda parsel başına birer harç oluşur (villa parseli harçlı, arsa
   parseli harçsız). Elle değiştirme/sıfırlama aynen; G1 muafiyeti aynen.
   (Golden testli.)

2) SIKIŞIK TABLO GİTTİ — İKİ KATLI FERAH TAŞINMAZ KARTLARI GELDİ:
   Üst kat kimlik (Tür · Mahalle · Ada · Parsel · Alan — hepsi etiketli ve
   elle yazılabilir; Excel'deki orijinal nitelik türün üstünde küçük notla
   durur), alt kat para (Taban ücret · %Yüzde [öneri değeri yanında] ·
   ₺Belediye harcı · Tapu adedi · Rapor seçici). Düzenlenebilir kutular
   belirgin çerçeveli, salt-okunur değerler düz metin — neyin
   değiştirilebileceği bakışta belli. Mobilde kendiliğinden akar;
   koyu tema desteklenir.

3) TEK TAŞINMAZLI RAPORDA % KUTUSU GİZLENDİ (hep %100'dür, kafa
   karıştırıyordu); rapor çok taşınmazlı olunca kutu belirir.

4) TARAMADA BULUNAN VE DÜZELTİLEN PÜRÜZLER:
   - Yarış durumu: mahalle sözlüğü inmeden dosya yüklenirse mahalle→ilçe
     çözümü sessizce atlanabiliyordu; artık dosya çözümünden önce güvenceye
     alınır.
   - Aktarım: otomatik (kayıttan) gelen belediye harcı kompozere yanlışlıkla
     "elle girildi" olarak işaretleniyordu; artık kaynağı doğru taşınır.
   - Aktarım koşulundaki gereksiz/karmaşık bir ifade sadeleştirildi
     (davranış değişmedi, okunabilirlik arttı).

## Sistemin tam kural seti (bugünkü oturumların özeti)
- İlk öneri SAF TEBLİĞ: G1 aynı mahalle · G2 aynı ada/parsel kendiliğinden;
  diğer her şey taşınmaz başına ayrı rapor. Birleştirme kullanıcının hakkı
  ("özel rapor" rozeti; "tebliğ" rozeti koşulu sağlayanlarda).
- Yüzde modeli: en yüksek taban %100; diğerleri G2 %15 · G1 %20 · diğer %20
  önerilir; her satırda serbest (%50 vb.), ↺ önerilene döner.
- Tapu taşınmaz başına birer; "TAKBİS almayın" → 0. Yol/TDUB/bilgi merkezi
  rapor başına tek; kapatılabilir. Teklif tutarı rapor başına ezilebilir;
  maliyet dökümü ofiste görünür; müşteri teklifinde KDV hariç + KDV %20.
- Akıllı okuma: başlık satırı otomatik, müşteri unvanı yakalanır, birleşik
  ADA/PARSEL ve "Eski/Yeni" çözülür, nitelikteki gömülü m² okunur, boş
  konumlar üstten miras alır (⤷), il/ilçe/mahalle VE NİTELİK yazım hataları
  fuzzy düzeltilir (✎; TARLLLA→Tarla, OFŞS→Ofis) — belirsizlikte asla dayatmaz.

## Yükleme
GitHub → Dora-Degerleme-Pro → Add file → Upload files → `src` ve `public`
klasörlerini sürükleyip bırak → Commit → build → yayın reposuna aktar.
