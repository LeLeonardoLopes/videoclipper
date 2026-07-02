import { Routes, Route } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { ProcessingPage } from '../pages/ProcessingPage';
import { ResultsPage } from '../pages/ResultsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/processing/:jobId" element={<ProcessingPage />} />
      <Route path="/results/:jobId" element={<ResultsPage />} />
    </Routes>
  );
}
