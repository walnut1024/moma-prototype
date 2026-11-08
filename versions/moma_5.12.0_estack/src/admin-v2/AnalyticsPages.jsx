import UserAnalysisPage from './UserAnalysisPage';
import UsageAnalysisPage from './UsageAnalysisPage';
import CallAnalysisPage from './CallAnalysisPage';

export default function AnalyticsPages({ pageId, state }) {
  if (pageId === 'usage-analysis') return <UsageAnalysisPage state={state}/>;
  if (pageId === 'user-analysis') return <UserAnalysisPage state={state}/>;
  return <CallAnalysisPage state={state}/>;
}
