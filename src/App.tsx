import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { NewCalculationPage } from './pages/NewCalculationPage';
import { HistoryPage } from './pages/HistoryPage';
import { MultiProposalPage } from './pages/MultiProposalPage';
import { BulkImportPage } from './pages/BulkImportPage';
import { DataManagementPage } from './pages/DataManagementPage';
import { AdminPage } from './pages/AdminPage';
import { ProposalTemplatePage } from './pages/ProposalTemplatePage';
import { SettingsPage } from './pages/SettingsPage';
import { TariffProvider } from './context/TariffContext';
import { SettingsProvider } from './context/SettingsContext';
import { LocationProvider } from './context/LocationContext';
import { CompanyProfileProvider } from './context/CompanyProfileContext';

function App() {
  return (
    <TariffProvider>
      <LocationProvider>
        <SettingsProvider>
          <CompanyProfileProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/hesapla" element={<NewCalculationPage />} />
                  <Route path="/gecmis" element={<HistoryPage />} />
                  <Route path="/coklu-teklif" element={<MultiProposalPage />} />
                  <Route path="/toplu-yukleme" element={<BulkImportPage />} />
                  <Route path="/ayarlar" element={<SettingsPage />} />
                  <Route path="/veri-yonetimi" element={<DataManagementPage />} />
                  <Route path="/yonetici" element={<AdminPage />} />
                  <Route path="/teklif-sablonu" element={<ProposalTemplatePage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </CompanyProfileProvider>
        </SettingsProvider>
      </LocationProvider>
    </TariffProvider>
  );
}

export default App;
