import { Banner } from '@douyinfe/semi-ui';
import { activeProjectSpendBudget } from '../project-token-budget.mjs';

export default function ProjectBudgetNotice({ project, spend }) {
  const budget=activeProjectSpendBudget(project);
  if (!budget?.amountMicros || !spend) return null;
  const percentUsed=spend.spent/budget.amountMicros*100;
  if (percentUsed < budget.warnAt) return null;
  const label=percentUsed >= 100 ? budget.stop ? '项目预算已达上限，按量调用已停止' : '项目预算已达上限'
    : '项目预算已达到预警阈值';
  return <Banner className="project-budget-alert" type="warning" description={label + ' · 已用 ' + (percentUsed.toFixed(1) + '%')} />;
}
