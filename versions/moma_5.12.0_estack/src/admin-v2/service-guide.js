export function serviceGuideRequest(model,callId,providerId='') {
  const requests={
    image:{path:'/images/generations',body:{prompt:'一座清晨的城市公园，柔和自然光',size:'1024x1024'}},
    video:{path:'/videos',body:{prompt:'镜头缓慢掠过清晨的城市公园',duration:5}},
    audio:{path:'/audio/speech',body:{input:'欢迎使用模型服务。',voice:'default',response_format:'mp3'}},
    embedding:{path:'/embeddings',body:{input:'这是一段需要向量化的文本。'}},
    rerank:{path:'/rerank',body:{query:'模型服务',documents:['统一模型接口','模型供应渠道']}},
  };
  const request=requests[model.type] || {path:'/chat/completions',body:{messages:[{role:'user',content:'你好，请介绍一下你的能力。'}]}};
  const configured=model.apiGuides?.[providerId || 'standard'];
  if(configured?.prompt){
    if(request.body.messages)request.body.messages=[{role:'user',content:configured.prompt}];
    else if('prompt' in request.body)request.body.prompt=configured.prompt;
    else if('input' in request.body)request.body.input=configured.prompt;
    else request.body.query=configured.prompt;
  }
  return {...request,codes:configured?.codes,body:{model:callId,...request.body}};
}
export function serviceGuideCode({path,body,codes},language) {
  if(codes && Object.hasOwn(codes,language))return codes[language];
  const json=JSON.stringify(body,null,2);
  if(language==='Python')return `import os, json, urllib.request\n\nrequest = urllib.request.Request(\n    os.environ["MOMA_BASE_URL"].rstrip("/") + "${path}",\n    data=json.dumps(${JSON.stringify(body)}).encode(),\n    headers={"Authorization": "Bearer " + os.environ["MOMA_API_KEY"],\n             "Content-Type": "application/json"},\n    method="POST"\n)\nwith urllib.request.urlopen(request) as response:\n    print(response.read())`;
  if(language==='Java')return `var client = java.net.http.HttpClient.newHttpClient();\nvar request = java.net.http.HttpRequest.newBuilder()\n    .uri(java.net.URI.create(System.getenv("MOMA_BASE_URL") + "${path}"))\n    .header("Authorization", "Bearer " + System.getenv("MOMA_API_KEY"))\n    .header("Content-Type", "application/json")\n    .POST(java.net.http.HttpRequest.BodyPublishers.ofString("""\n${json}\n"""))\n    .build();\nvar response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());`;
  if(language==='Go')return `package main\n\nimport ("bytes"; "fmt"; "io"; "net/http"; "os")\n\nfunc main() {\n    req, err := http.NewRequest("POST", os.Getenv("MOMA_BASE_URL") + "${path}", bytes.NewBufferString(\`${json}\`))\n    if err != nil { panic(err) }\n    req.Header.Set("Authorization", "Bearer " + os.Getenv("MOMA_API_KEY"))\n    req.Header.Set("Content-Type", "application/json")\n    res, err := http.DefaultClient.Do(req)\n    if err != nil { panic(err) }\n    defer res.Body.Close()\n    body, err := io.ReadAll(res.Body)\n    if err != nil { panic(err) }\n    fmt.Println(string(body))\n}`;
  return `curl "$MOMA_BASE_URL${path}" \\\n  -H "Authorization: Bearer $MOMA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
}
