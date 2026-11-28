import './prototype-ui-switch.css';

const uiVariant = import.meta.env.VITE_MOMA_UI_VARIANT;
const versions = [
  { id: 'planning', label: '产品规划', path: '/moma_5.12.0_estack/' },
  { id: 'ui-modified', label: 'ui-modified', path: '/ui-modified/' },
];

export default function PrototypeUiSwitch({ admin }) {
  if (!versions.some(version => version.id === uiVariant)) return null;
  const route = admin ? '#/admin-2/dashboard' : '';
  return <nav className="prototype-ui-switch" aria-label="原型版本" data-moma-ui-variant={uiVariant}>
    {versions.map(({ id, label, path }) => id === uiVariant
      ? <span key={id} aria-current="page">{label}</span>
      : <a key={id} href={path + route}>{label}</a>)}
  </nav>;
}
