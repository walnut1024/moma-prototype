import { useEffect, useState } from 'react';
import { agreementHref } from '../agreement-route.mjs';
import { agreementWithDefault } from '../default-site-terms.mjs';
import { AGREEMENTS } from '../site-config.mjs';
import { cloudAdminRequest } from '../admin-v2/admin-client.mjs';
import { AgreementContent } from './SiteAgreementLinks';
import './public-agreement.css';

export default function PublicAgreement({ documentKey }) {
  const [published, setPublished] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const label = AGREEMENTS.find(([key]) => key === documentKey)[1];

  useEffect(() => {
    const controller = new AbortController();
    cloudAdminRequest('/site-agreements', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPublished(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const previous = document.title;
    document.title = label;
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [label]);

  const agreement = published && agreementWithDefault(documentKey, published.agreements[documentKey]);
  return <div className="public-agreement">
    <nav aria-label="站点协议">
      {AGREEMENTS.map(([key, name]) => <a key={key} href={agreementHref(key)}
        aria-current={documentKey === key ? 'page' : undefined}>{name}</a>)}
    </nav>
    <main>
      <h1>{label}</h1>
      {error ? <p role="alert">无法加载协议。 <button type="button" onClick={() => { setError(false); setAttempt(count => count + 1); }}>重试</button></p>
        : !agreement ? <p role="status">正在加载协议…</p>
        : agreement.url ? <a href={agreement.url} rel="noreferrer">打开{label}</a>
        : <AgreementContent agreement={agreement} />}
    </main>
  </div>;
}
