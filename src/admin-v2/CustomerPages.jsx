import EnterprisePage from './EnterprisePage';

export default function CustomerPage({ state, transact, deploymentTarget }) {
  return <EnterprisePage state={state} transact={transact} deploymentTarget={deploymentTarget}/>;
}
