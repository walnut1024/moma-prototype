import { PLANNING_BASE } from './prototype-ui.mjs';
import './prototype-ui-switch.css';

export default function PrototypeUiSwitch({ admin }) {
  const href = PLANNING_BASE + (admin ? '#/admin-2/dashboard' : '');
  return <nav className="prototype-ui-switch" aria-label="原型版本" data-moma-ui-variant="ui-modified">
    <a href={href}>产品规划</a>
    <span aria-current="page">20261204 演示准备版</span>
  </nav>;
}
