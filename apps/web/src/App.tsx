import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { Header } from './components/layout/Header';
import { Toast } from './components/feedback/Toast';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <AppRoutes />
        </main>
      </div>
      <Toast />
    </BrowserRouter>
  );
}
