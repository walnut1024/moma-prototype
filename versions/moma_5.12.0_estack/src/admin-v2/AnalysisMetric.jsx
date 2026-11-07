import { Button, Card, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';

export function AnalysisHelp({ label, children }) {
  return <Tooltip content={children} trigger="hover">
    <Button size="small" theme="borderless" type="tertiary" icon={<IconHelpCircle aria-hidden="true"/>} aria-label={`${label}说明`}/>
  </Tooltip>;
}

export default function AnalysisMetric({ title, value, unit, help, children }) {
  return <Card>
    <div className="admin-analysis-metric">
      <div className="admin-analysis-metric-label">
        <Typography.Text type="secondary">{title}</Typography.Text>
        {help && <AnalysisHelp label={title}>{help}</AnalysisHelp>}
      </div>
      <div className="admin-analysis-metric-value">
        <Typography.Title heading={4} component="span">{value}</Typography.Title>
        {unit && <Typography.Text type="secondary" size="small">{unit}</Typography.Text>}
      </div>
      {children}
    </div>
  </Card>;
}
