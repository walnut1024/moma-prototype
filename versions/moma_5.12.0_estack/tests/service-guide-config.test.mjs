import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceGuideRequest,serviceGuideCode} from '../src/admin-v2/service-guide.js';
test('guide configuration stays scoped to the selected service and shares every code renderer',()=>{
 const model={type:'text',apiGuides:{standard:{prompt:'统一示例'},moma:{prompt:'移动云示例'},zhipu:{prompt:'智谱示例'}}};
 for(const [provider,id,prompt] of [['','unified','统一示例'],['moma','glm-moma','移动云示例'],['zhipu','glm-zhipu','智谱示例']]){
  const request=serviceGuideRequest(model,id,provider);
  assert.equal(request.body.model,id);assert.equal(request.body.messages[0].content,prompt);
  for(const language of ['cURL','Python','Java','Go']){const code=serviceGuideCode(request,language);assert.ok(code.includes(id));assert.ok(code.includes(prompt));assert.ok(code.includes('MOMA_BASE_URL'));}
 }
 assert.equal(model.apiGuides.moma.prompt,'移动云示例');
});

test('manual examples are returned verbatim and isolated by supplier and language',()=>{
 const model={type:'text',apiGuides:{standard:{codes:{cURL:'curl custom\n'}},moma:{codes:{Python:'print("MoMA")\n'}},zhipu:{codes:{Python:'print("Zhipu")\n'}}}};
 assert.equal(serviceGuideCode(serviceGuideRequest(model,'id'),'cURL'),'curl custom\n');
 assert.equal(serviceGuideCode(serviceGuideRequest(model,'a','moma'),'Python'),'print("MoMA")\n');
 assert.equal(serviceGuideCode(serviceGuideRequest(model,'b','zhipu'),'Python'),'print("Zhipu")\n');
 assert.ok(serviceGuideCode(serviceGuideRequest(model,'a','moma'),'Go').includes('a'));
});
