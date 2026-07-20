import { Link } from 'react-router-dom';
import { CalculatorIcon, HistoryIcon, SettingsIcon, ShareIcon } from '../components/icons';

export function HomePage() {
  return (
    <div>
      <div className="page__header">
        <span className="page__eyebrow">Dora Gayrimenkul Değerleme A.Ş.</span>
        <h1 className="page__title">DORA DEĞERLEME PRO</h1>
        <p className="page__desc">Profesyonel Değerleme ve Teklif Yönetim Sistemi</p>
      </div>

      <div className="menu-grid">
        <Link to="/hesapla" className="menu-card menu-card--primary">
          <div className="menu-card__icon"><CalculatorIcon /></div>
          <div>
            <div className="menu-card__title">Tek Tapu Teklifi Hazırlama</div>
            <div className="menu-card__desc">Taşınmaz bilgilerini girerek ücret hesapla</div>
          </div>
        </Link>

        <Link to="/coklu-teklif" className="menu-card">
          <div className="menu-card__icon"><ShareIcon /></div>
          <div>
            <div className="menu-card__title">Çoklu Teklif</div>
            <div className="menu-card__desc">Aynı raporda çoklu ya da çok sayıda rapor için fiyat teklifi</div>
          </div>
        </Link>

        <Link to="/gecmis" className="menu-card">
          <div className="menu-card__icon"><HistoryIcon /></div>
          <div>
            <div className="menu-card__title">Kayıtlı Teklifler</div>
            <div className="menu-card__desc">Kayıtlı teklifleri görüntüle</div>
          </div>
        </Link>

        <Link to="/ayarlar" className="menu-card">
          <div className="menu-card__icon"><SettingsIcon /></div>
          <div>
            <div className="menu-card__title">Ayarlar</div>
            <div className="menu-card__desc">Firma profili, yedekleme ve yönetici merkezi</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
