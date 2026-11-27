import UserAnalysisPage from './UserAnalysisPage';
import UsageAnalysisPage from './UsageAnalysisPage';

export default function AnalyticsPages({ pageId, state }) {
  if (pageId === 'usage-analysis') return <UsageAnalysisPage state={state}/>;
  if (pageId === 'user-analysis') return <UserAnalysisPage state={state}/>;
  return null;
}
