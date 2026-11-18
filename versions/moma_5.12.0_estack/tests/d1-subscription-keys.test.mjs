import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';

test('enterprise and personal subscription keys cannot move across identical-name subscriptions or change another subscription', {timeout:30_000}, async t => {
  const previous=process.env.VITE_MOMA_PRIVATE_SITE;
  process.env.VITE_MOMA_PRIVATE_SITE='1';
  t.after(()=>{if(previous===undefined)delete process.env.VITE_MOMA_PRIVATE_SITE;else process.env.VITE_MOMA_PRIVATE_SITE=previous;});
  const password=randomUUID(),digest=value=>createHash('sha256').update(value).digest('hex');
  const local=await startLocalBackend({presets:true,loginHashes:Object.fromEntries(['zqzh','grzh'].map(id=>[id,digest(password)]))});
  t.after(()=>local.runtime.dispose());
  const origin='https://prototype.test';
  async function request(path,cookie,body) {
    const response=await local.runtime.dispatchFetch(origin+'/api/v1/'+path,{method:body?'POST':'GET',headers:{
      ...(cookie?{cookie}:{}),...(body?{origin,'x-moma-request':'1','content-type':'application/json'}:{}),
    },...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const clients=[];
  for(const tenantId of ['zqzh','grzh']) {
    const signed=await request('auth/sign-in',null,{identifier:tenantId,accessCode:password});
    assert.equal(signed.status,200);
    clients.push({tenantId,cookie:signed.cookie});
  }
  const reference=JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  for(const {tenantId} of clients) for(const suffix of ['a','b','expired']) reference.orders.push({
    id:tenantId+'-subscription-'+suffix,tenantId,packageId:'same-package',product:{name:'同名订阅套餐',billingMode:'Token Plan'},
    modelIds:[],status:'生效中',expiresAt:suffix==='expired'?'2020-01-01T00:00:00.000Z':'2099-01-01T00:00:00.000Z',
  });
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(reference)).run();
  for(const {tenantId,cookie} of clients) {
    const workspace=async()=>{const result=await request('market/workspace',cookie);assert.equal(result.status,200);return result.data;};
    const initial=await workspace(),projectId=initial.projects[0].id;
    const [first,second]=['a','b'].map(suffix=>tenantId+'-subscription-'+suffix);
    const plans=initial.plans.filter(plan=>[first,second].includes(plan.id));
    assert.equal(plans.length,2);assert.equal(plans[0].product.name,plans[1].product.name);
    const save=async(subscriptionId,rows,billing='Token Plan')=>request('market/commands',cookie,{
      operationId:randomUUID(),tenantId,expectedRevision:(await workspace()).revision,action:'keys',data:{projectId,billing,subscriptionId,rows},
    });
    const inputA={id:randomUUID(),name:'同名密钥',enabled:true,models:null,secretPreview:'sk-demo*****aaaa'};
    const inputB={...inputA,id:randomUUID(),secretPreview:'sk-demo*****bbbb'};
    const digestA=digest(randomUUID()),digestB=digest(randomUUID());
    assert.equal((await save(first,[{...inputA,credentialDigest:digestA}])).status,200);
    assert.equal((await save(second,[{...inputB,credentialDigest:digestA}])).status,422,'subscriptions cannot share one credential');
    assert.equal((await save(second,[{...inputB,credentialDigest:digestB}])).status,200);
    const keys=async()=> (await workspace()).keys;
    const beforeB=(await keys()).find(key=>key.id===inputB.id);
    assert.equal(beforeB.subscriptionId,second);
    assert.equal((await keys()).find(key=>key.id===inputA.id).subscriptionId,first);
    assert(!JSON.stringify(await workspace()).includes(digestA));
    assert(!JSON.stringify(await workspace()).includes(digestB));
    for(const [subscriptionId,rows,billing] of [
      [second,[inputA]],
      [undefined,[inputA],'按量付费'],
      [tenantId+'-subscription-expired',[{...inputA,id:randomUUID()}]],
      [(tenantId==='zqzh'?'grzh':'zqzh')+'-subscription-a',[{...inputA,id:randomUUID()}]],
    ]) {
      const before=await keys();assert.equal((await save(subscriptionId,rows,billing)).status,422);assert.deepEqual(await keys(),before);
    }
    assert.equal((await save(first,[{...inputA,name:'只编辑套餐 A'}])).status,200);
    assert.deepEqual((await keys()).find(key=>key.id===inputB.id),beforeB);
    const rotatedDigest=digest(randomUUID());
    assert.equal((await save(first,[{...inputA,credentialVersion:2,credentialDigest:rotatedDigest,secretPreview:'sk-demo*****newa'}])).status,200);
    const stored=JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json')).apiKeys;
    assert.equal(stored.find(key=>key.id===inputA.id).credentialDigest,rotatedDigest);
    assert.equal(stored.find(key=>key.id===inputB.id).credentialDigest,digestB);
    assert.deepEqual((await keys()).find(key=>key.id===inputB.id),beforeB);
    assert.equal((await save(first,[])).status,200);
    assert(!(await keys()).some(key=>key.id===inputA.id));
    assert.deepEqual((await keys()).find(key=>key.id===inputB.id),beforeB);
    assert.equal((await save(second,[inputA])).status,422,'deleted key IDs cannot be reused by another subscription');
  }
});
