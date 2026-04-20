import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MeetingSetup from './pages/MeetingSetup';
import Recording from './pages/Recording';
import Processing from './pages/Processing';
import Editing from './pages/Editing';
import Summary from './pages/Summary';
import SendSave from './pages/SendSave';
import History from './pages/History';
import HistoryDetail from './pages/HistoryDetail';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/setup" element={<MeetingSetup />} />
      <Route path="/recording" element={<Recording />} />
      <Route path="/processing" element={<Processing />} />
      <Route path="/editing" element={<Editing />} />
      <Route path="/summary" element={<Summary />} />
      <Route path="/send" element={<SendSave />} />
      <Route path="/history" element={<History />} />
      <Route path="/history/:meetingId" element={<HistoryDetail />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
