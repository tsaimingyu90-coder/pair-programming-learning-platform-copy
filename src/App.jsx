import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PreviewProvider } from '@/lib/PreviewContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useState, useEffect } from 'react';
import WeekSelection from './pages/WeekSelection';
import TaskPage from './pages/TaskPage';
import AssignmentEditor from './pages/AssignmentEditor';
import Register from './pages/Register';
import QuizPage from './pages/QuizPage';
import ScalePage from './pages/ScalePage';
import PreTestResults from './pages/PreTestResults';
import StudentDetailPage from './pages/StudentDetailPage';
import ChatLogPage from './pages/ChatLogPage';
import SystemPromptManager from './pages/SystemPromptManager';
import AssignmentManager from './pages/AssignmentManager';
import PerformanceMonitor from './pages/PerformanceMonitor';
import ParticipantManager from './pages/ParticipantManager';
import ParticipantEditor from './pages/ParticipantEditor';
import TestPage from './pages/TestPage';
import DebugPage from './pages/DebugPage';
import BatchUpdateClass from './pages/BatchUpdateClass';
import WeekSelectionPreview from './pages/WeekSelectionPreview';
import AttendancePage from './pages/AttendancePage';
import PostTestPage from './pages/PostTestPage';
import PaperQuizInput from './pages/PaperQuizInput';
import TestComparison from './pages/TestComparison';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  
  console.log('[AuthenticatedApp] Rendering...', { isLoadingAuth, isLoadingPublicSettings, authError });

  // CRITICAL: Force show app after short timeout to prevent infinite loading
  const [showFallback, setShowFallback] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      console.warn('[AuthenticatedApp] Timeout - forcing render');
      setShowFallback(true);
    }, 2000); // 2 seconds
    
    return () => clearTimeout(timer);
  }, []);

  // Handle authentication errors (but don't block rendering)
  if (authError && authError.type === 'user_not_registered') {
    console.log('[AuthenticatedApp] Showing UserNotRegisteredError');
    return <UserNotRegisteredError />;
  }

  console.log('[AuthenticatedApp] Rendering Routes');
  // Render the main app (even if still loading)
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/WeekSelection" element={
        <LayoutWrapper currentPageName="WeekSelection">
          <WeekSelection />
        </LayoutWrapper>
      } />
      <Route path="/WeekSelection/preview/:participantId" element={
        <LayoutWrapper currentPageName="WeekSelectionPreview">
          <WeekSelectionPreview />
        </LayoutWrapper>
      } />
      <Route path="/TaskPage" element={
        <LayoutWrapper currentPageName="TaskPage">
          <TaskPage />
        </LayoutWrapper>
      } />
      <Route path="/AssignmentEditor" element={
        <LayoutWrapper currentPageName="AssignmentEditor">
          <AssignmentEditor />
        </LayoutWrapper>
      } />
      <Route path="/Register" element={
        <LayoutWrapper currentPageName="Register">
          <Register />
        </LayoutWrapper>
      } />
      <Route path="/QuizPage" element={
        <LayoutWrapper currentPageName="QuizPage">
          <QuizPage />
        </LayoutWrapper>
      } />
      <Route path="/ScalePage" element={
        <LayoutWrapper currentPageName="ScalePage">
          <ScalePage />
        </LayoutWrapper>
      } />
      <Route path="/PreTestResults" element={
        <LayoutWrapper currentPageName="PreTestResults">
          <PreTestResults />
        </LayoutWrapper>
      } />
      <Route path="/StudentDetailPage" element={
        <LayoutWrapper currentPageName="StudentDetailPage">
          <StudentDetailPage />
        </LayoutWrapper>
      } />
      <Route path="/ChatLogPage" element={
        <LayoutWrapper currentPageName="ChatLogPage">
          <ChatLogPage />
        </LayoutWrapper>
      } />
      <Route path="/SystemPromptManager" element={
        <LayoutWrapper currentPageName="SystemPromptManager">
          <SystemPromptManager />
        </LayoutWrapper>
      } />
      <Route path="/AssignmentManager" element={
        <LayoutWrapper currentPageName="AssignmentManager">
          <AssignmentManager />
        </LayoutWrapper>
      } />
      <Route path="/PerformanceMonitor" element={
        <LayoutWrapper currentPageName="PerformanceMonitor">
          <PerformanceMonitor />
        </LayoutWrapper>
      } />
      <Route path="/ParticipantManager" element={
        <LayoutWrapper currentPageName="ParticipantManager">
          <ParticipantManager />
        </LayoutWrapper>
      } />
      <Route path="/ParticipantEditor" element={
        <LayoutWrapper currentPageName="ParticipantEditor">
          <ParticipantEditor />
        </LayoutWrapper>
      } />
      <Route path="/TestPage" element={
        <LayoutWrapper currentPageName="TestPage">
          <TestPage />
        </LayoutWrapper>
      } />
      <Route path="/DebugPage" element={
        <LayoutWrapper currentPageName="DebugPage">
          <DebugPage />
        </LayoutWrapper>
      } />
      <Route path="/BatchUpdateClass" element={
        <LayoutWrapper currentPageName="BatchUpdateClass">
          <BatchUpdateClass />
        </LayoutWrapper>
      } />
      <Route path="/AttendancePage" element={
        <LayoutWrapper currentPageName="AttendancePage">
          <AttendancePage />
        </LayoutWrapper>
      } />
      <Route path="/PostTestPage" element={
        <LayoutWrapper currentPageName="PostTestPage">
          <PostTestPage />
        </LayoutWrapper>
      } />
      <Route path="/PaperQuizInput" element={
        <LayoutWrapper currentPageName="PaperQuizInput">
          <PaperQuizInput />
        </LayoutWrapper>
      } />
      <Route path="/TestComparison" element={
        <LayoutWrapper currentPageName="TestComparison">
          <TestComparison />
        </LayoutWrapper>
      } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  console.log('=== [App] Starting render ===');

  return (
    <AuthProvider>
      <PreviewProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </PreviewProvider>
    </AuthProvider>
  )
}

export default App