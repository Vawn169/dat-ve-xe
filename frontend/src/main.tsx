import { App as AntApp, ConfigProvider, Result } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { NotifyBridge } from './notify';
import { ChatWidget } from './components/ChatWidget';
import { Footer, Header } from './components/Header';
import { Account, ForgotPassword, ResetPassword } from './pages/Account';
import { Admin } from './pages/Admin';
import { ChangeTrip } from './pages/ChangeTrip';
import { Checkout } from './pages/Checkout';
import { PaymentResult } from './pages/PaymentResult';
import { Staff } from './pages/Staff';
import { Support } from './pages/Support';
import { Home } from './pages/Home';
import { Lookup } from './pages/Lookup';
import { MockPay } from './pages/MockPay';
import { MyTickets } from './pages/MyTickets';
import { SearchResults } from './pages/SearchResults';
import './styles.css';

dayjs.locale('vi');

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tim-chuyen" element={<SearchResults />} />
            <Route path="/dat-ve" element={<Checkout />} />
            <Route path="/thanh-toan" element={<MockPay />} />
            <Route path="/ve-cua-toi" element={<MyTickets />} />
            <Route path="/tra-cuu" element={<Lookup />} />
            <Route path="/thanh-toan/ket-qua" element={<PaymentResult />} />
            <Route path="/doi-ve/:code" element={<ChangeTrip />} />
            <Route path="/tai-khoan" element={<Account />} />
            <Route path="/quen-mat-khau" element={<ForgotPassword />} />
            <Route path="/dat-lai-mat-khau" element={<ResetPassword />} />
            <Route path="/ho-tro" element={<Support />} />
            <Route path="/nhan-vien" element={<Staff />} />
            <Route path="/quan-tri" element={<Admin />} />
            <Route
              path="*"
              element={
                <Result
                  status="404"
                  title="Không tìm thấy trang"
                  extra={
                    <Link className="btn-primary" to="/">
                      Về trang chủ
                    </Link>
                  }
                />
              }
            />
          </Routes>
        </main>
        <Footer />
        <ChatWidget />
      </div>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#0b7a5e',
          borderRadius: 8,
          fontFamily: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif',
        },
      }}
    >
      <AntApp>
        <NotifyBridge />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
