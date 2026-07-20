import { Link } from 'react-router-dom';
import { SettingsIcon, BuildingIcon, HistoryIcon } from '../components/icons';

/**
 * YÖNETİCİ MERKEZİ — yıllık bakım ve kurumsal kimlik tek çatı altında.
 * SPK tarifesi/belediye harçları (Veri Yönetimi), teklif metni (Teklif Şablonu)
 * ve firma kimliği (Ayarlar içindeki Firma Profili) buradan yönetilir.
 */
export function AdminPage() {
  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Yönetici</span>
        <h1 className="page__title">Yönetici Merkezi</h1>
        <p className="page__desc">
          Uygulamanın yıllık bakımı ve kurumsal içeriği buradan yönetilir; günlük teklif akışını
          etkilemez.
        </p>
      </div>

      <div className="menu-grid" style={{ gridTemplateColumns: '1fr' }}>
        <Link to="/veri-yonetimi" className="menu-card">
          <div className="menu-card__icon"><HistoryIcon /></div>
          <div>
            <div className="menu-card__title">Veri Yönetimi</div>
            <div className="menu-card__desc">
              Yıllık SPK tarifesi ve belediye harçları — yeni yıl dosyalarını üret, doğrula, yayınla.
              Kod değişikliği gerekmez.
            </div>
          </div>
        </Link>

        <Link to="/teklif-sablonu" className="menu-card">
          <div className="menu-card__icon"><SettingsIcon /></div>
          <div>
            <div className="menu-card__title">Teklif Şablonu</div>
            <div className="menu-card__desc">
              Otomatik teklif metnini yer tutucularla düzenle; tüm yeni teklifler senin metninle açılsın.
            </div>
          </div>
        </Link>

        <Link to="/ayarlar" className="menu-card">
          <div className="menu-card__icon"><BuildingIcon /></div>
          <div>
            <div className="menu-card__title">Firma Profili ve Ücret Ayarları</div>
            <div className="menu-card__desc">
              Künye, IBAN, logo, imza görseli, teklif alt notu ve sabit ücretler (Ayarlar ekranı).
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
