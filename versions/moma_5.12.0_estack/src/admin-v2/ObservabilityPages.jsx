import CallLogsPage from './CallLogsPage';
import ChannelHealthPage from './ChannelHealthPage';
import './semi-observability.css';

const pages = { 'providers-health': ChannelHealthPage, logs: CallLogsPage };

export default function ObservabilityPage({ pageId, params, ...props }) {
  const Page = pages[pageId];
  return <Page key={pageId + params.toString()} params={params} {...props}/>;
}
