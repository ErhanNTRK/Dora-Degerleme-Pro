import { NavLink, Outlet } from 'react-router-dom';
import { HomeIcon, CalculatorIcon, HistoryIcon, SettingsIcon, SunIcon, MoonIcon } from './icons';
import { useSettings } from '../context/SettingsContext';

export function Layout() {
  const { settings, updateSettings } = useSettings();
  const isDark = settings?.themeMode === 'dark';

  return (
    <div className="app-shell" data-theme={isDark ? 'dark' : 'light'}>
      <header className="top-nav">
        <NavLink to="/" className="top-nav__brand">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Dora Gayrimenkul Değerleme" className="top-nav__logo" />
          <div>
            <div className="top-nav__title">DORA DEĞERLEME PRO</div>
            <div className="top-nav__subtitle">Profesyonel Değerleme ve Teklif Yönetim Sistemi</div>
          </div>
        </NavLink>
        <div className="top-nav__actions">
          <button
            className="icon-button"
            aria-label="Tema değiştir"
            onClick={() => updateSettings({ themeMode: isDark ? 'light' : 'dark' })}
          >
            {isDark ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
          </button>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav__item${isActive ? ' active' : ''}`}>
          <HomeIcon width={20} height={20} />
          Ana Sayfa
        </NavLink>
        <NavLink to="/hesapla" className={({ isActive }) => `bottom-nav__item${isActive ? ' active' : ''}`}>
          <CalculatorIcon width={20} height={20} />
          Hesapla
        </NavLink>
        <NavLink to="/gecmis" className={({ isActive }) => `bottom-nav__item${isActive ? ' active' : ''}`}>
          <HistoryIcon width={20} height={20} />
          Geçmiş
        </NavLink>
        <NavLink to="/ayarlar" className={({ isActive }) => `bottom-nav__item${isActive ? ' active' : ''}`}>
          <SettingsIcon width={20} height={20} />
          Ayarlar
        </NavLink>
      </nav>
    </div>
  );
}
