import { Button, Toast } from '@douyinfe/semi-ui';
import { Copy } from 'lucide-react';

export const apiHost = 'https://xxxxxx.com';
export const baseUrl = apiHost + '/v1';
export const chatEndpoint = baseUrl + '/chat/completions';
export const apiKey = 'sk-xxxxxx';
const modelName = 'example-model';
export const modelId = 'moma/' + modelName;

export function ExampleCopy({ value, label, english }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      Toast.success(english ? 'Copied' : '已复制');
    } catch {
      Toast.error(english ? 'Could not copy. Select the text to copy it manually.' : '复制失败，请选中文本后手动复制');
    }
  };
  return <Button size="small" theme="borderless" aria-label={label} icon={<Copy size={14} aria-hidden="true" />} onClick={copy}>
    {english ? 'Copy' : '复制'}
  </Button>;
}

export const toolGuides = [
  {
    id: "workbuddy", name: "WorkBuddy", mark: "W",
    keywords: "办公 智能体 文档 自动化 productivity documents work buddy",
    zh: { description: "办公任务与日常工作自动化", intro: "按 WorkBuddy 原厂自定义模型界面，配置 MoMA 的接口、密钥与模型。", url: "https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Model",
      steps: <>
        <ol className="steps">
          <li>
            <h4>进入「添加模型」</h4>
            <p>安装并登录 <a href="https://www.workbuddy.cn/" target="_blank" rel="noopener noreferrer">WorkBuddy ↗</a>，进入 <b>设置 → 模型</b>，在自定义模型区域点击 <b>添加模型</b>。</p>
          </li>
          <li>
            <h4>选择「自定义 / Custom」</h4>
            <p>在「提供商」下拉框选择 <b>自定义 / Custom</b>，展开高级配置。该入口支持 OpenAI 兼容协议，可填写 MoMA 的模型服务参数。</p>
          </li>
          <li>
            <h4>填写模型参数</h4>
            <p>以下以 {modelName} 为例。先确认该模型已开通，再按字段名称填写：</p>
            <div className="form-guide">
              <div className="guide-title"><span>MoMA · WorkBuddy 配置</span><span>填写示例</span></div>
              <div className="form-row"><span>提供商</span><div className="form-value">自定义 / Custom</div></div>
              <div className="form-row"><span>接口地址</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>API KEY</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>模型名称</span><div className="form-value">{modelId}</div></div>
              <div className="form-row"><span>自定义协议</span><div className="form-value">勾选 · 直接使用完整接口地址</div></div>
            </div>
            <p className="hint">接口地址使用 <code>https://</code> 和完整路径 <code>/v1/chat/completions</code>。模型名称复制调用示例中的 <code>model</code> 值，保留调用名中的前缀（如有），不填写 <code>mod-…</code>。</p>
          </li>
          <li>
            <h4>按模型能力设置高级配置</h4>
            <p><b>自定义协议：</b>本教程勾选，让 WorkBuddy 按完整地址请求，不再自动补全路径；接口仍为 OpenAI Chat Completions。</p>
            <p><b>工具调用、图片输入、推理模式：</b>仅在已确认该模型及平台接口支持时勾选。用于智能体执行任务时，需确认工具调用能力。</p>
            <p><b>输入 / 输出：</b>按模型详情及实际调用限制填写上下文和最大输出长度，不确定时保留默认值。</p>
          </li>
          <li>
            <h4>保存并选择自定义模型</h4>
            <p>点击 <b>保存</b>，回到任务对话，在模型选择器的 <b>自定义模型</b> 分组中选中 <b>{modelId}</b>。先发送简单问答，成功后再测试一个简单工具任务。</p>
            <div className="callout">此处应选择刚添加的自定义模型，确保请求发送到 MoMA。如失败，检查下方常见问题中的密钥权限、模型名称和请求地址。</div>
          </li>
        </ol>
      </>,
    },
    en: { description: "Office and daily tasks", intro: "Add a model from the platform to WorkBuddy through a custom API.", url: "https://www.tencentcloud.com/document/product/1316/84496",
      steps: <>
        <ol className="steps">
          <li>
            <h4>Open Add Model</h4>
            <p>Install <a href="https://www.workbuddy.cn/" target="_blank" rel="noopener noreferrer">WorkBuddy ↗</a> and sign in. Go to <b>Settings → Models</b> (<span lang="zh-CN">设置 → 模型</span>). Under Custom Models, select <b>Add Model</b> (<span lang="zh-CN">添加模型</span>).</p>
          </li>
          <li>
            <h4>Select Custom as the provider</h4>
            <p>In <b>Provider</b> (<span lang="zh-CN">提供商</span>), select <b>Custom</b> (<span lang="zh-CN">自定义</span>). Expand the advanced settings. This provider type supports the OpenAI-compatible protocol.</p>
          </li>
          <li>
            <h4>Enter the platform settings</h4>
            <p>This example uses {modelName}. Before you enter the values, confirm that you have a subscription for the model.</p>
            <div className="form-guide">
              <div className="guide-title"><span>WorkBuddy settings</span><span>Value</span></div>
              <div className="form-row"><span>Provider <span lang="zh-CN">提供商</span></span><div className="form-value">Custom</div></div>
              <div className="form-row"><span>Endpoint <span lang="zh-CN">接口地址</span></span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>API KEY</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>Model name <span lang="zh-CN">模型名称</span></span><div className="form-value">{modelId}</div></div>
              <div className="form-row"><span>Custom Protocol <span lang="zh-CN">自定义协议</span></span><div className="form-value">On · Use the full request URL</div></div>
            </div>
            <p className="hint">Use <code>https://</code> and the full <code>/v1/chat/completions</code> path. Copy the <code>model</code> value from the platform request example. Keep the model ID prefix, if present. Do not enter a <code>mod-…</code> resource ID.</p>
          </li>
          <li>
            <h4>Set advanced options for the model</h4>
            <p><b>Custom Protocol.</b> Turn this on so WorkBuddy uses the full URL without appending a path. The endpoint still uses OpenAI Chat Completions.</p>
            <p><b>Tool calling, image input, and reasoning mode.</b> Enable each feature only if the model and endpoint support it. If the agent needs to run tools, verify tool calling.</p>
            <p><b>Input / Output</b> (<span lang="zh-CN">输入 / 输出</span>). Use the model’s context and output limits. If you are unsure, keep the defaults.</p>
          </li>
          <li>
            <h4>Save and select the custom model</h4>
            <p>Click <b>Save</b> (<span lang="zh-CN">保存</span>) and return to the task conversation. In the <b>Custom Models</b> group, select <b>{modelId}</b>. Send a simple message. If the model replies, test a simple tool task.</p>
            <div className="callout">Select the custom model you added to send requests to the platform. If a request fails, check API key permissions, the model ID, and the URL in the FAQ below.</div>
          </li>
        </ol>
      </>,
    },
  },
  {
    id: "ccswitch", name: "CC Switch", mark: "⇄",
    keywords: "Claude Code 编程 代理 路由 协议转换 coding programming proxy routing",
    zh: { description: "管理 Claude Code 的模型配置", intro: "以 Claude Code 为例，完整配置 MoMA 的供应商、认证、模型映射与本地路由。", url: "https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/2-providers/2.1-add.md",
      steps: <>
        <p className="hint">操作界面已按本机 CC Switch <b>4.0.21</b> 核对。中文 / 英文按钮名称同时列出，便于对照。</p>
        <div className="route"><strong>Claude Code</strong><span>→ Anthropic 请求 →</span><strong>CC Switch 本地路由</strong><span>→ OpenAI Chat →</span><strong>MoMA</strong>
        </div>
        <ol className="steps">
          <li>
            <h4>安装 CC Switch 和 Claude Code</h4>
            <p>从 <a href="https://github.com/farion1231/cc-switch/releases" target="_blank" rel="noopener noreferrer">CC Switch 官方下载页 ↗</a> 下载匹配系统与 CPU 架构的安装包：macOS 使用 <code>.dmg</code> 并拖入「应用程序」，Windows 使用 <code>.msi</code>，Linux 选择 <code>.deb</code>、<code>.rpm</code> 或 <code>.AppImage</code>。</p>
            <p>CC Switch 管理配置并转换协议；实际编程任务由 Claude Code 执行。尚未安装 Claude Code 时，按系统选择一条 <a href="https://code.claude.com/docs/en/setup#install-claude-code" target="_blank" rel="noopener noreferrer">官方安装命令 ↗</a>：</p>
            <details>
              <summary>macOS / Linux：安装 Claude Code</summary>
              <div className="code-box">
                <div className="code-header"><span>在终端执行</span><ExampleCopy value="curl -fsSL https://claude.ai/install.sh | bash" />
                </div>
                <pre tabIndex={0}><code>curl -fsSL https://claude.ai/install.sh | bash</code></pre>
              </div>
            </details>
            <details>
              <summary>Windows PowerShell：安装 Claude Code</summary>
              <div className="code-box">
                <div className="code-header"><span>在 PowerShell 执行</span><ExampleCopy value="irm https://claude.ai/install.ps1 | iex" />
                </div>
                <pre tabIndex={0}><code>irm https://claude.ai/install.ps1 | iex</code></pre>
              </div>
            </details>
            <p>安装完成后重新打开终端，运行以下命令。能看到版本号再继续；找不到命令时先按官方文档修复 PATH。</p>
            <div className="code-box">
              <div className="code-header"><span>检查客户端安装</span><ExampleCopy value="claude --version" />
              </div>
              <pre tabIndex={0}><code>claude --version</code></pre>
            </div>
            <p className="hint">本教程将 CC Switch 和 Claude Code 安装在同一系统中。Windows 原生与 WSL 的回环网络、配置目录不同，请先保持二者运行环境一致。</p>
          </li>
          <li>
            <h4>添加自定义供应商</h4>
            <p>打开 CC Switch，在左侧选择 <b>Claude Code</b>，点击右上角 <b>添加供应商 / Add Provider</b>，在预设选择页点击 <b>自定义配置 / Custom Configuration</b>。</p>
            <div className="form-guide">
              <div className="guide-title"><span>基本信息</span><span>按表填写</span></div>
              <div className="form-row"><span>Name / 名称</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>API Key</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>API Endpoint / 请求地址</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>Website URL / 网站</span><div className="form-value">{apiHost}（选填）</div></div>
            </div>
            <p className="hint">API Key 输入框只填密钥本身，不加 <code>Bearer </code> 前缀。模型需要已订购，密钥需有对应调用权限。</p>
          </li>
          <li>
            <h4>设置上游协议、完整 URL 和认证方式</h4>
            <p>展开 <b>高级选项 / Advanced Options</b>，逐项设置：</p>
            <div className="form-guide">
              <div className="guide-title"><span>高级选项</span><span>三个必核对项</span></div>
              <div className="form-row"><span>Upstream Format / 上游格式</span><div className="form-value">OpenAI Chat Completions（需要路由）</div></div>
              <div className="form-row"><span>Full URL / 完整 URL</span><div className="form-value">开启</div></div>
              <div className="form-row"><span>Auth Field / 认证字段</span><div className="form-value">ANTHROPIC_AUTH_TOKEN（默认）</div></div>
            </div>
            <p>路由使用 <code>ANTHROPIC_AUTH_TOKEN</code> 对应的密钥向上游发送 <code>Authorization: Bearer …</code>。字段名带有 Anthropic 是因为配置对象是 Claude Code，平台上游协议仍是 OpenAI Chat Completions。</p>
            <div className="callout">本教程使用完整地址，必须开启 Full URL。不要选 Anthropic Messages 或 OpenAI Responses；也不要将 Auth Field 改成通过 <code>x-api-key</code> 传递密钥的选项。</div>
          </li>
          <li>
            <h4>填写模型映射，覆盖主任务和后台任务</h4>
            <p>在 <b>模型映射 / Model Mapping</b> 中，将 <b>Requested model / 实际请求模型</b> 填为平台调用示例中的模型名。首次接入可以统一使用同一个已开通模型：</p>
            <div className="cc-table-scroll">
              <table className="params cc-model-table">
                <thead>
                  <tr><th scope="col">模型角色</th><th scope="col">实际请求模型</th><th scope="col">填写说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Sonnet</td><td><code>{modelId}</code></td><td>日常主任务</td>
                  </tr>
                  <tr><td>Opus</td><td><code>{modelId}</code></td><td>切换到该角色时使用</td>
                  </tr>
                  <tr><td>Fable</td><td><code>{modelId}</code></td><td>界面显示该角色时填写</td>
                  </tr>
                  <tr><td>Haiku</td><td><code>{modelId}</code></td><td>后台任务，务必填写</td>
                  </tr>
                  <tr><td>Subagent</td><td><code>{modelId}</code></td><td>子代理使用的模型</td>
                  </tr>
                  <tr><td>Default fallback model</td><td><code>{modelId}</code></td><td>启动主模型与默认兜底，务必填写</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p><b>Display name / 显示名称</b> 可填 <code>{modelName}</code>，仅影响 <code>/model</code> 菜单显示，不能代替实际请求模型。<b>Declare 1M</b> 首次接入先不勾选，确认模型和平台链路真实支持后再设置。</p>
            <p className="hint">手动填写即可，无需点击 Fetch Models。模型名保留调用名中的前缀（如有）；这里不填写 Claude 官方模型名或 <code>mod-…</code> 资源编号。</p>
            <div className="callout">只填默认模型仍不完整：本机版本明确提示，Haiku 为空时后台任务可能直接发送原始 Claude 模型名，导致主对话正常但后台任务报错。</div>
          </li>
          <li>
            <h4>保存供应商，启动路由并选中平台</h4>
            <p>核对表单后点击底部 <b>添加 / Add</b>。配置编辑区中的已有 hooks、插件等属于其他设置，请保留；协议、完整 URL 和模型映射通过上面的表单配置。</p>
            <p>回到 <b>Claude Code</b> 页面，点击顶部 <b>路由 / Routing</b> 标签，再点击 <b>开始路由 / Start routing</b>，阅读并确认其修改客户端连接方式的提示。随后在 <b>MoMA</b> 供应商卡片上点击 <b>切换 / Switch</b>，确认它成为当前路由目标。</p>
            <div className="form-guide">
              <div className="guide-title"><span>路由启用后应核对的状态</span><span>状态示意</span></div>
              <div className="form-row"><span>连接模式</span><div className="form-value">Routing / 路由已生效</div></div>
              <div className="form-row"><span>当前供应商</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>本地路由服务</span><div className="form-value">运行中 / Running</div></div>
              <div className="form-row"><span>默认监听地址</span><div className="form-value">127.0.0.1:15721</div></div>
            </div>
            <p>在 <b>设置 → 本地路由 → 服务</b> 中可查看服务状态。如果提示服务未运行，点击 <b>启动 / Start</b>。旧版若使用“路由总开关 / 代理服务”和“Claude Code 接管”开关，需要同时开启服务并接管 Claude Code。</p>
            <div className="callout">只点击 Routing 标签是在查看该模式，不代表启用。必须执行 Start routing，并确认当前目标是MoMA。</div>
          </li>
          <li>
            <h4>检查连接关系，重新启动 Claude Code</h4>
            <p>路由生效后，CC Switch 自动把 Claude Code 的连接地址改为本地路由。两个地址各有用途：</p>
            <div className="form-guide">
              <div className="form-row"><span>CC Switch → 平台</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>Claude Code → CC Switch</span><div className="form-value">http://127.0.0.1:15721（默认）</div></div>
            </div>
            <p>客户端配置里的密钥在路由期间可能显示为占位符，这是正常行为；真实平台密钥由 CC Switch 在转发时注入。请保持 CC Switch 路由服务运行。</p>
            <p>退出已运行的 Claude Code，打开新终端，在准备使用的项目目录执行：</p>
            <div className="code-box">
              <div className="code-header"><span>启动 Claude Code</span><ExampleCopy value="claude" />
              </div>
              <pre tabIndex={0}><code>claude</code></pre>
            </div>
            <p>进入会话后输入 <code>/model</code>，确认能选择刚配置的角色或显示名称，再发送「你好，请简单介绍一下自己」。首次启用或关闭路由后，需要重新启动 Claude Code。</p>
          </li>
          <li>
            <h4>分别验证接口、路由和智能体任务</h4>
            <p><b>① 平台接口：</b>用下方「验证接入」中的 cURL 请求检查密钥和模型，确认 HTTP 200 且有有效回复。</p>
            <p><b>② 路由链路：</b>在 Claude Code 发出测试消息后，查看 CC Switch 的请求记录 / 用量明细，确认供应商为 <b>MoMA</b>、实际模型为 <code>{modelId}</code>、请求成功。记录请求用量需处于启用状态。</p>
            <p><b>③ 工具调用：</b>在测试项目中发送「请列出当前目录的文件名，不修改文件」，检查工具是否实际执行并返回结果。问答成功只说明基础对话连通，不能代替工具调用验证。</p>
            <div className="success"><span>接入完成标准：平台请求成功、CC Switch 路由目标正确、Claude Code 收到回复，并完成一个简单工具任务。</span>
            </div>
          </li>
          <li>
            <h4>切换模型与结束使用</h4>
            <p>切换模型时，在 CC Switch 编辑该供应商的模型映射，保存后开启新会话核对 <code>/model</code>。切换供应商时，在 Routing 页面选择另一个已配置目标。</p>
            <p>若以后要恢复直连，先在 CC Switch 执行 <b>回到直连 / Back to Direct</b>，为客户端选择原本支持直连的供应商，再退出 CC Switch。MoMA这份 Chat Completions 配置仍需协议转换，不能直接作为 Claude Code 的 Anthropic 服务使用。</p>
          </li>
        </ol>
        <h3>CC Switch 专项排查</h3>
        <div className="faq cc-troubleshooting">
          <details>
            <summary>供应商已添加，为什么仍请求原来的服务？</summary>
            <p>确认执行了 Start routing，而不是仅选中 Routing 标签；确认当前供应商已切换为MoMA。关闭旧 Claude Code 进程，在新终端重启。</p>
          </details>
          <details>
            <summary>提示 Connection refused，或退出 CC Switch 后无法使用？</summary>
            <p>检查本地路由服务是否运行，实际监听地址和端口是否与客户端配置一致。默认端口是 15721；端口被占用时可在 CC Switch 中调整并保存重启，再重启 Claude Code。</p>
          </details>
          <details>
            <summary>返回 401 / 403，密钥看起来没有填错？</summary>
            <p>在供应商表单核对 API Key 和模型权限；Auth Field 使用 ANTHROPIC_AUTH_TOKEN，使路由发送 Bearer 鉴权。客户端配置中的占位符无需手动改成真实密钥。</p>
          </details>
          <details>
            <summary>返回 404 / 405，或路径出现重复的 /v1？</summary>
            <p>上游格式选择 OpenAI Chat Completions，Full URL 开启，API Endpoint 填完整请求地址。不要在完整地址后再次附加 /v1 或 /chat/completions。</p>
          </details>
          <details>
            <summary>主对话正常，但后台任务提示 Claude 模型不存在？</summary>
            <p>重点核对 Haiku、Subagent 和 Default fallback model；将实际请求模型填为已开通的 {modelId} 或其他有效模型名。显示名称不会改变上游请求的 model。</p>
          </details>
          <details>
            <summary>一直要求登录，或修改配置后仍没有生效？</summary>
            <p>先确认 Claude Code 已由 CC Switch 路由接管，并重新打开终端。检查终端启动脚本是否另设 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY，避免覆盖 CC Switch 管理的配置；只清理已确认过期的手动设置。</p>
          </details>
          <details>
            <summary>接口成功，但工具任务报 400 或执行中断？</summary>
            <p>检查实际模型及平台对 tools、tool_calls、流式输出和上下文的支持，并查看失败请求的具体参数。按平台错误信息调整能力选项；不要仅凭客户端模型名称或 1M 勾选框判断实际能力。</p>
          </details>
        </div>
        <p className="hint">依据 <a href="https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/2-providers/2.1-add.md" target="_blank" rel="noopener noreferrer">供应商配置说明 ↗</a> 与 <a href="https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/4-proxy/4.1-service.md" target="_blank" rel="noopener noreferrer">本地路由说明 ↗</a>，并核对本机实际界面。按钮位置可能随版本变化。</p>
      </>,
    },
    en: { description: "Claude Code model configuration", intro: "Use CC Switch local routing to send Claude Code requests to the platform.", url: "https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/2-providers/2.1-add.md",
      steps: <>
        <p className="hint">These steps use CC Switch <b>4.0.21</b>. Button names and locations can vary by version.</p>
        <div className="route"><strong>Claude Code</strong><span>→ Anthropic request →</span><strong>CC Switch local routing</strong><span>→ OpenAI Chat →</span><strong>MoMA</strong>
        </div>
        <ol className="steps">
          <li>
            <h4>Install CC Switch and Claude Code</h4>
            <p>Download the package for your operating system and CPU from the <a href="https://github.com/farion1231/cc-switch/releases" target="_blank" rel="noopener noreferrer">CC Switch releases page ↗</a>. On macOS, open the <code>.dmg</code> and drag the app into Applications. On Windows, use the <code>.msi</code>. On Linux, choose a <code>.deb</code>, <code>.rpm</code>, or <code>.AppImage</code>.</p>
            <p>CC Switch manages settings and converts requests. Claude Code runs coding tasks. If Claude Code is missing, follow the <a href="https://code.claude.com/docs/en/setup#install-claude-code" target="_blank" rel="noopener noreferrer">official installation instructions ↗</a> for your system.</p>
            <details>
              <summary>Install Claude Code on macOS or Linux</summary>
              <div className="code-box">
                <div className="code-header"><span>Run in a terminal</span><ExampleCopy value="curl -fsSL https://claude.ai/install.sh | bash" english />
                </div>
                <pre tabIndex={0}><code>curl -fsSL https://claude.ai/install.sh | bash</code></pre>
              </div>
            </details>
            <details>
              <summary>Install Claude Code in Windows PowerShell</summary>
              <div className="code-box">
                <div className="code-header"><span>Run in PowerShell</span><ExampleCopy value="irm https://claude.ai/install.ps1 | iex" english />
                </div>
                <pre tabIndex={0}><code>irm https://claude.ai/install.ps1 | iex</code></pre>
              </div>
            </details>
            <p>Open a new terminal and run this command. Continue when it returns a version number. If the terminal cannot find the command, use the Claude Code documentation to fix PATH.</p>
            <div className="code-box">
              <div className="code-header"><span>Check the installation</span><ExampleCopy value="claude --version" english />
              </div>
              <pre tabIndex={0}><code>claude --version</code></pre>
            </div>
            <p className="hint">Run CC Switch and Claude Code in the same environment. Native Windows and WSL have different loopback networks and configuration directories.</p>
          </li>
          <li>
            <h4>Add a custom provider</h4>
            <p>Open CC Switch and select <b>Claude Code</b> on the left. Click <b>Add Provider</b> in the upper right. On the presets screen, select <b>Custom Configuration</b>.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Basic settings</span><span>Value</span></div>
              <div className="form-row"><span>Name</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>API Key</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>API Endpoint</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>Website URL</span><div className="form-value">{apiHost} (optional)</div></div>
            </div>
            <p className="hint">Enter the key without the <code>Bearer </code> prefix. You must have a model subscription and an API key with access to it.</p>
          </li>
          <li>
            <h4>Set the upstream protocol, full URL, and authentication</h4>
            <p>Expand <b>Advanced Options</b> and apply these settings.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Advanced options</span><span>Value</span></div>
              <div className="form-row"><span>Upstream Format</span><div className="form-value">OpenAI Chat Completions (routing required)</div></div>
              <div className="form-row"><span>Full URL</span><div className="form-value">On</div></div>
              <div className="form-row"><span>Auth Field</span><div className="form-value">ANTHROPIC_AUTH_TOKEN (default)</div></div>
            </div>
            <p>CC Switch uses the key from <code>ANTHROPIC_AUTH_TOKEN</code> to send <code>Authorization: Bearer …</code> upstream. The field name comes from Claude Code. The platform uses OpenAI Chat Completions.</p>
            <div className="callout">Turn on Full URL for this endpoint. Do not select Anthropic Messages, OpenAI Responses, or an Auth Field option that sends the key in <code>x-api-key</code>.</div>
          </li>
          <li>
            <h4>Map models for main and background tasks</h4>
            <p>In <b>Model Mapping</b>, set each <b>Requested model</b> to a model ID from the platform request example. For initial setup, you can use one subscribed model for all roles.</p>
            <div className="cc-table-scroll">
              <table className="params cc-model-table">
                <thead>
                  <tr><th scope="col">Model role</th><th scope="col">Requested model</th><th scope="col">Use</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Sonnet</td><td><code>{modelId}</code></td><td>Main tasks</td>
                  </tr>
                  <tr><td>Opus</td><td><code>{modelId}</code></td><td>Used when you select Opus</td>
                  </tr>
                  <tr><td>Fable</td><td><code>{modelId}</code></td><td>Set this if the role appears</td>
                  </tr>
                  <tr><td>Haiku</td><td><code>{modelId}</code></td><td>Required for background tasks</td>
                  </tr>
                  <tr><td>Subagent</td><td><code>{modelId}</code></td><td>Used by subagents</td>
                  </tr>
                  <tr><td>Default fallback model</td><td><code>{modelId}</code></td><td>Required at startup and as the fallback</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>You can set <b>Display name</b> to <code>{modelName}</code> for the <code>/model</code> menu. Enter the full ID in Requested model. Leave <b>Declare 1M</b> off until you confirm that the model and platform support it.</p>
            <p className="hint">Enter model IDs manually. Skip Fetch Models. Keep the model ID prefix, if present. Do not enter an official Claude model name or a <code>mod-…</code> resource ID.</p>
            <div className="callout">Set Haiku as well as the default model. If Haiku is blank, background requests can send the original Claude model name and fail while the main chat still works.</div>
          </li>
          <li>
            <h4>Save the provider and start routing</h4>
            <p>Check the form and click <b>Add</b>. Keep existing hooks and plugins in the configuration editor. Use the form above to set the protocol, full URL, and model mappings.</p>
            <p>Return to <b>Claude Code</b> and open <b>Routing</b>. Click <b>Start routing</b>, then read and confirm the change to the client connection. Click <b>Switch</b> on the <b>MoMA</b> provider card. Check that it is the current target.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Routing status</span><span>Expected value</span></div>
              <div className="form-row"><span>Connection mode</span><div className="form-value">Routing active</div></div>
              <div className="form-row"><span>Current provider</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>Local routing service</span><div className="form-value">Running</div></div>
              <div className="form-row"><span>Default listen address</span><div className="form-value">127.0.0.1:15721</div></div>
            </div>
            <p>Check the service under <b>Settings → Local Routing → Service</b>. If it is stopped, click <b>Start</b>. In older versions with separate proxy service and Claude Code takeover switches, turn on both.</p>
            <div className="callout">Opening the Routing tab only shows the mode. Click Start routing and confirm that the platform is the current target.</div>
          </li>
          <li>
            <h4>Check the connection and restart Claude Code</h4>
            <p>When routing starts, CC Switch sets the Claude Code endpoint to its local router. Check both connections.</p>
            <div className="form-guide">
              <div className="form-row"><span>CC Switch → platform</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>Claude Code → CC Switch</span><div className="form-value">http://127.0.0.1:15721 (default)</div></div>
            </div>
            <p>During routing, the client configuration can show a placeholder key. CC Switch adds the platform key when it forwards requests. Keep its routing service running.</p>
            <p>Exit Claude Code. Open a new terminal in the project directory and run this command.</p>
            <div className="code-box">
              <div className="code-header"><span>Start Claude Code</span><ExampleCopy value="claude" english />
              </div>
              <pre tabIndex={0}><code>claude</code></pre>
            </div>
            <p>Enter <code>/model</code> and check that you can select the role or display name you configured. Send “Hello, please introduce yourself briefly.” Restart Claude Code after you first enable or turn off routing.</p>
          </li>
          <li>
            <h4>Verify the API, routing, and tool calling</h4>
            <p><b>① Platform API.</b> Use the cURL example in Verify the Connection to test your key and model. Check for HTTP 200 and a valid reply.</p>
            <p><b>② Local routing.</b> Enable usage logging. Send a message in Claude Code, then open the request or usage details in CC Switch. Check that the provider is <b>MoMA</b>, the actual model is <code>{modelId}</code>, and the request succeeded.</p>
            <p><b>③ Tool calling.</b> In a test project, send “List the filenames in the current directory without changing any files.” Check that Claude Code runs the tool and returns its result. A successful chat reply verifies only basic chat.</p>
            <div className="success"><span>Setup is complete when the platform request succeeds, the routing target is correct, Claude Code receives a reply, and a simple tool task succeeds.</span>
            </div>
          </li>
          <li>
            <h4>Switch models or stop routing</h4>
            <p>To change models, edit this provider’s mappings in CC Switch and save. Open a new session and check <code>/model</code>. To change providers, select another configured target on the Routing tab.</p>
            <p>To restore a direct connection, click <b>Back to Direct</b> in CC Switch. Select a provider that supports a direct connection to Claude Code, then quit CC Switch. This platform configuration requires protocol conversion for Claude Code.</p>
          </li>
        </ol>
        <h3>CC Switch Troubleshooting</h3>
        <div className="faq cc-troubleshooting">
          <details>
            <summary>Why does Claude Code still use the old provider?</summary>
            <p>Check that you clicked Start routing and selected the platform as the current provider. Exit the old Claude Code process. Restart it from a new terminal.</p>
          </details>
          <details>
            <summary>Why do I get Connection refused or lose access when CC Switch closes?</summary>
            <p>Check that the local routing service runs and that its address and port match the client settings. The default port is 15721. If it is in use, change the port in CC Switch, save, and restart the service. Then restart Claude Code.</p>
          </details>
          <details>
            <summary>Why do I get HTTP 401 or 403 with a valid key?</summary>
            <p>Check the API key and model permissions in the provider form. Set Auth Field to ANTHROPIC_AUTH_TOKEN to send Bearer authentication. Leave the placeholder in the client configuration.</p>
          </details>
          <details>
            <summary>Why do I get HTTP 404 or 405, or a duplicate /v1?</summary>
            <p>Set Upstream Format to OpenAI Chat Completions and turn on Full URL. Enter the full request URL in API Endpoint. Do not append /v1 or /chat/completions again.</p>
          </details>
          <details>
            <summary>Why does chat work while background tasks report a missing Claude model?</summary>
            <p>Check Haiku, Subagent, and Default fallback model. Set Requested model to {modelId} or another valid ID from your subscription. The display name does not change the upstream model value.</p>
          </details>
          <details>
            <summary>Why does Claude Code keep asking me to sign in or ignore the new settings?</summary>
            <p>Confirm that CC Switch controls Claude Code routing, then open a new terminal. Check startup scripts for ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, or ANTHROPIC_API_KEY overrides. Remove only manual settings you have confirmed are obsolete.</p>
          </details>
          <details>
            <summary>Why do tool tasks fail with HTTP 400 or stop midway?</summary>
            <p>Check model and platform support for tools, tool_calls, streaming, and context length. Inspect the parameters of the failed request and adjust capability settings based on the platform error. The display name and Declare 1M setting do not establish actual model capabilities.</p>
          </details>
        </div>
        <p className="hint">See the <a href="https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/2-providers/2.1-add.md" target="_blank" rel="noopener noreferrer">provider settings guide ↗</a> and the <a href="https://github.com/farion1231/cc-switch/blob/v4.0.21/docs/user-manual/zh/4-proxy/4.1-service.md" target="_blank" rel="noopener noreferrer">local routing guide ↗</a>. The steps were checked against the local client. Button locations can vary by version.</p>
      </>,
    },
  },
  {
    id: "trae", name: "TRAE", mark: ">_",
    keywords: "IDE 编程 代码 开发 coding programming",
    zh: { description: "在 AI IDE 中使用平台模型", intro: "在 TRAE 的模型设置中添加自定义模型，使用 OpenAI Chat Completions。", url: "https://docs.trae.cn/ide_models",
      steps: <>
        <ol className="steps">
          <li>
            <h4>安装并进入模型设置</h4>
            <p>从 <a href="https://www.trae.cn/" target="_blank" rel="noopener noreferrer">TRAE 官网 ↗</a> 安装客户端。进入 <b>设置 → 模型 → 添加模型</b>，选择 <b>自定义模型</b>。</p>
          </li>
          <li>
            <h4>填写自定义模型参数</h4>
            <p>将 API 格式设为 <b>OpenAI Chat Completions</b>，开启 <b>完整 URL</b> 后填入完整请求地址。</p>
            <div className="form-guide">
              <div className="guide-title"><span>添加自定义模型</span><span>字段填写示意</span></div>
              <div className="form-row"><span>API 格式</span><div className="form-value">OpenAI Chat Completions</div></div>
              <div className="form-row"><span>自定义请求地址</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>完整 URL</span><div className="form-value">开启</div></div>
              <div className="form-row"><span>模型 ID</span><div className="form-value">{modelId}</div></div>
              <div className="form-row"><span>模型展示名称</span><div className="form-value">MoMA · {modelName}</div></div>
              <div className="form-row"><span>API 密钥</span><div className="form-value">{apiKey}</div></div>
            </div>
            <p className="hint">模型展示名称可自定义；模型 ID 必须与平台调用示例一致。高级配置先保留默认值，图片输入等能力按实际模型支持情况设置。</p>
          </li>
          <li>
            <h4>添加模型并开始对话</h4>
            <p>完成添加后，在 AI 对话输入框的模型选择器中选择 <b>MoMA · {modelName}</b>。先验证简单问答，再验证代码与工具任务。</p>
            <div className="callout">若看不到“自定义模型”或“完整 URL”，请核对客户端版本及所在版本的功能支持，不要选用 Anthropic Messages 代替。</div>
          </li>
        </ol>
      </>,
    },
    en: { description: "Custom models in an AI IDE", intro: "Add a custom model in TRAE and use the OpenAI Chat Completions protocol.", url: "https://docs.trae.cn/ide_models",
      steps: <>
        <ol className="steps">
          <li>
            <h4>Install TRAE and open model settings</h4>
            <p>Install the client from the <a href="https://www.trae.cn/" target="_blank" rel="noopener noreferrer">TRAE website ↗</a>. Go to <b>Settings → Models → Add Model</b> (<span lang="zh-CN">设置 → 模型 → 添加模型</span>). Select <b>Custom Model</b> (<span lang="zh-CN">自定义模型</span>).</p>
          </li>
          <li>
            <h4>Enter the custom model settings</h4>
            <p>Set API Format to <b>OpenAI Chat Completions</b>. Turn on <b>Full URL</b> (<span lang="zh-CN">完整 URL</span>) and enter the full request URL.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Custom model</span><span>Example values</span></div>
              <div className="form-row"><span>API format</span><div className="form-value">OpenAI Chat Completions</div></div>
              <div className="form-row"><span>Custom request URL</span><div className="form-value">{chatEndpoint}</div></div>
              <div className="form-row"><span>Full URL</span><div className="form-value">On</div></div>
              <div className="form-row"><span>Model ID</span><div className="form-value">{modelId}</div></div>
              <div className="form-row"><span>Model display name</span><div className="form-value">MoMA · {modelName}</div></div>
              <div className="form-row"><span>API key</span><div className="form-value">{apiKey}</div></div>
            </div>
            <p className="hint">You can set your own display name. The model ID must match the platform request example. Keep the default advanced settings for initial setup. Enable features such as image input only if the model supports them.</p>
          </li>
          <li>
            <h4>Save the model and start a chat</h4>
            <p>In the model selector next to the AI chat input, select <b>MoMA · {modelName}</b>. Test a simple chat message first. Then test coding and tool tasks.</p>
            <div className="callout">If Custom Model or Full URL is missing, check your client version and the features it supports. Do not select Anthropic Messages.</div>
          </li>
        </ol>
      </>,
    },
  },
  {
    id: "dsh", name: "DeepSeek Harness", mark: "D",
    keywords: "DSH 开源 智能体 编程 coding programming agent",
    zh: { description: "配置开源智能体的模型服务", intro: "根据本机 DSH 实际界面，将MoMA添加为自定义模型服务。", url: "https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md",
      steps: <>
        <ol className="steps">
          <li>
            <h4>打开 DSH 的模型设置</h4>
            <p>本机已部署时打开 <a href="http://127.0.0.1:3080/" target="_blank" rel="noopener noreferrer">http://127.0.0.1:3080/ ↗</a>，点击左下角 <b>More / 账号菜单 → Settings → Models</b>，再点击 <b>Add model provider</b>。</p>
            <p className="hint">该地址指向当前电脑。远程部署请使用实际 DSH 地址；首次安装请参照 <a href="https://github.com/deepseek-ai/deepseek-harness#run" target="_blank" rel="noopener noreferrer">官方启动指南 ↗</a>。</p>
          </li>
          <li>
            <h4>选择「Custom model API」并填写参数</h4>
            <p>切换到 <b>Custom model API</b>，填写自定义供应商信息。协议选择 <b>OpenAI Chat Completions</b>。</p>
            <div className="form-guide">
              <div className="guide-title"><span>MoMA · DSH 配置</span><span>填写示例</span></div>
              <div className="form-row"><span>Provider ID</span><div className="form-value">moma</div></div>
              <div className="form-row"><span>Display name</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>Base URL</span><div className="form-value">{baseUrl}</div></div>
              <div className="form-row"><span>API protocol</span><div className="form-value">OpenAI Chat Completions</div></div>
              <div className="form-row"><span>API key</span><div className="form-value">{apiKey}</div></div>
            </div>
            <p className="hint">Provider ID 使用小写且以字母开头，创建后不可直接改名。协议配置值为 <code>openai-completions</code>；Base URL 到 <code>/v1</code> 为止，客户端会补全 <code>/chat/completions</code>。</p>
          </li>
          <li>
            <h4>手动添加模型</h4>
            <p>在 <b>Models</b> 区域点击 <b>+ Add model</b>：左侧 <b>Model ID</b> 填 <code>{modelId}</code>，右侧 <b>Display name</b> 可填 <code>{modelName}</code>。请保留模型 ID 的服务商前缀。</p>
            <p>无需点击 <b>Fetch available models</b>。此教程仅依赖已明确提供的 Chat Completions 接口，模型列表手动添加即可。</p>
            <p className="hint">模型行右侧的 <b>Model options</b> 可设置上下文、输出长度等参数，按已开通模型的能力填写。</p>
          </li>
          <li>
            <h4>创建供应商并在新会话中选择</h4>
            <p>核对参数后点击 <b>Create provider</b>，关闭 Settings。新建会话，在输入框下方的模型选择器中选择 <b>MoMA → {modelName}</b>，然后发送测试消息。</p>
            <p className="hint">已发送请求的会话可能保留原模型。本指南对应版本 <code>0.2.1-rc.3</code>，其他版本的按钮位置可能略有差异。</p>
          </li>
        </ol>
      </>,
    },
    en: { description: "Model setup for an open-source agent", intro: "Use the DeepSeek Harness model settings to add the platform as a custom provider.", url: "https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md",
      steps: <>
        <ol className="steps">
          <li>
            <h4>Open the model settings</h4>
            <p>If DSH runs on your computer, open <a href="http://127.0.0.1:3080/" target="_blank" rel="noopener noreferrer">http://127.0.0.1:3080/ ↗</a>. Open <b>More → Settings → Models</b> from the account menu in the lower left. Click <b>Add model provider</b>.</p>
            <p className="hint">This URL points to your computer. For a remote deployment, use its DSH URL. To install DSH, follow the <a href="https://github.com/deepseek-ai/deepseek-harness#run" target="_blank" rel="noopener noreferrer">official setup instructions ↗</a>.</p>
          </li>
          <li>
            <h4>Select Custom model API and enter the settings</h4>
            <p>Open <b>Custom model API</b>. Enter the provider details and select <b>OpenAI Chat Completions</b>.</p>
            <div className="form-guide">
              <div className="guide-title"><span>DSH settings</span><span>Value</span></div>
              <div className="form-row"><span>Provider ID</span><div className="form-value">moma</div></div>
              <div className="form-row"><span>Display name</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>Base URL</span><div className="form-value">{baseUrl}</div></div>
              <div className="form-row"><span>API protocol</span><div className="form-value">OpenAI Chat Completions</div></div>
              <div className="form-row"><span>API key</span><div className="form-value">{apiKey}</div></div>
            </div>
            <p className="hint">Use lowercase for the provider ID and start it with a letter. You cannot rename the ID directly after creation. The protocol setting value is <code>openai-completions</code>. End the base URL with <code>/v1</code>. The client appends <code>/chat/completions</code>.</p>
          </li>
          <li>
            <h4>Add the model manually</h4>
            <p>Under <b>Models</b>, click <b>+ Add model</b>. Enter <code>{modelId}</code> in <b>Model ID</b> and optionally <code>{modelName}</code> in <b>Display name</b>. Keep the provider prefix in the model ID.</p>
            <p>Skip <b>Fetch available models</b>. This guide uses the documented Chat Completions endpoint, so add the model manually.</p>
            <p className="hint">Use <b>Model options</b> to set the context and output limits for your model. </p>
          </li>
          <li>
            <h4>Create the provider and select the model</h4>
            <p>Check the settings, click <b>Create provider</b>, and close Settings. Open a new session and select <b>MoMA → {modelName}</b> below the input field. Send a test message.</p>
            <p className="hint">A session that already sent requests can keep its previous model. This guide uses version <code>0.2.1-rc.3</code>. Button locations can vary by version.</p>
          </li>
        </ol>
      </>,
    },
  },
  {
    id: "cherry", name: "Cherry Studio", mark: "C",
    keywords: "樱桃 聊天 对话 桌面 desktop chat cherrystudio",
    zh: { description: "在桌面客户端与平台模型对话", intro: "通过自定义服务商接入MoMA，在聊天界面选择平台模型进行对话。", url: "https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/providers/zi-ding-yi-fu-wu-shang.md",
      steps: <>
        <ol className="steps">
          <li>
            <h4>安装 Cherry Studio，打开模型服务设置</h4>
            <p>从 <a href="https://cherryai.com/" target="_blank" rel="noopener noreferrer">Cherry Studio 官方下载页 ↗</a> 获取适合当前系统的桌面客户端，完成安装并打开。点击左侧齿轮 <b>设置 → 模型服务 → + 添加服务商</b>。</p>
          </li>
          <li>
            <h4>添加平台供应商，选择 OpenAI Chat</h4>
            <p>在「添加自定义提供商」中，将名称填为 <b>MoMA</b>，填写平台 API 密钥，并配置 <b>OpenAI / OpenAI Chat Completions</b> 端点。提供商类型和协议以所用版本界面为准，最终请求必须使用 Chat Completions。</p>
            <div className="form-guide">
              <div className="guide-title"><span>自定义服务商配置</span><span>填写示例</span></div>
              <div className="form-row"><span>提供商名称</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>提供商类型 / 端点</span><div className="form-value">OpenAI · Chat Completions</div></div>
              <div className="form-row"><span>API 密钥</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>API 地址 / OpenAI 端点</span>
                <div className="form-value">
                  <div className="copy-cell"><code>{apiHost}</code><ExampleCopy value={apiHost} />
                  </div>
                </div>
              </div>
            </div>
            <p className="hint">API 地址填平台根地址，不包含 <code>/v1/chat/completions</code>。标准 OpenAI Chat 配置会自动补全路径，最终请求地址应为 <code>{chatEndpoint}</code>。API 密钥只填密钥本身，不加 <code>Bearer </code>。</p>
            <div className="callout">本指南使用 OpenAI Chat Completions。不要配置 Anthropic 或 OpenAI Responses 端点；若版本提供「使用 Responses API」开关，保持关闭。填好后点击「添加」或保存。</div>
          </li>
          <li>
            <h4>手动添加已开通的模型</h4>
            <p>在服务商列表选中 <b>MoMA</b>，在模型区域点击 <b>+ / 添加模型</b>，手动输入调用模型 ID。</p>
            <div className="form-guide">
              <div className="guide-title"><span>添加模型</span><span>以 {modelName} 为例</span></div>
              <div className="form-row"><span>模型 ID</span>
                <div className="form-value"><code>{modelId}</code>
                </div>
              </div>
              <div className="form-row"><span>模型名称 / 显示名称</span><div className="form-value">{modelName}（可自定义）</div></div>
              <div className="form-row"><span>分组</span><div className="form-value">MoMA（如有此项，可选填）</div></div>
            </div>
            <p className="hint">模型 ID 对应实际请求中的 <code>model</code> 值。请按调用示例原样填写，包括大小写和前缀。显示名称仅用于列表展示，<code>mod-…</code> 是资源编号。</p>
            <p>无需点击「获取模型列表」：平台在本指南中已明确提供的是聊天接口，不能假定支持 <code>/v1/models</code>。保存后，确认模型已加入该服务商的模型列表。</p>
          </li>
          <li>
            <h4>启用服务商并检测连接</h4>
            <p>打开供应商页面右上角的 <b>启用开关</b>。点击 <b>检测 / 检查</b>，选择刚添加的 <b>{modelName}</b> 进行测试；如果界面允许选择协议，选择 OpenAI Chat。</p>
            <p>检测失败时先用本页下方的 cURL 验证平台接口。若 cURL 成功而客户端失败，重点核对地址拼接、所选协议和模型 ID。</p>
          </li>
          <li>
            <h4>选择模型，开始聊天</h4>
            <p>返回 <b>聊天</b> 页面，新建话题，在输入框附近的模型选择器中选择 <b>MoMA → {modelName}</b>。发送「你好，请简单介绍一下自己」，确认得到模型回复。</p>
            <p>需要让其他助手使用同一模型时，在该助手的模型选择器中切换到平台模型；如果为默认助手设置模型，请在 <b>设置 → 默认模型</b> 中选择同一服务商下已添加的模型。</p>
            <div className="success"><span>接入完成标准：供应商已启用、模型能在选择器中找到、测试消息得到回复。知识库、图片和工具任务需另行确认模型与平台支持的能力。</span>
            </div>
          </li>
        </ol>
        <h3>Cherry Studio 专项排查</h3>
        <div className="faq">
          <details>
            <summary>服务商配置好了，为什么模型列表里找不到？</summary>
            <p>检查右上角启用开关是否打开，模型是否已通过「+ / 添加模型」加入该服务商。只保存 API 地址和密钥不会自动添加模型；列表获取失败时可手动输入模型 ID。</p>
          </details>
          <details>
            <summary>返回 404，或实际请求变成 /v1/responses？</summary>
            <p>API 地址按教程填根地址 <code>{apiHost}</code>，协议选 OpenAI Chat，关闭 Responses API，避免重复拼接 <code>/v1</code>。检查最终请求是否为 <code>/v1/chat/completions</code>。</p>
          </details>
          <details>
            <summary>返回 401 / 403，或提示模型不存在？</summary>
            <p>核对密钥是否有效、所选模型是否已开通，以及请求模型 ID 是否为平台详情页调用示例中的值。示例为 <code>{modelId}</code>，不是显示名称或资源编号。</p>
          </details>
          <details>
            <summary>聊天正常，但知识库或图片功能无法使用？</summary>
            <p>本接入仅确认 Chat Completions 配置方法。知识库通常还需嵌入等接口，图片输入、工具调用也取决于实际能力；不要将聊天模型配置为嵌入或图像生成模型。</p>
          </details>
        </div>
        <p className="hint">配置依据 <a href="https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/providers/zi-ding-yi-fu-wu-shang.md" target="_blank" rel="noopener noreferrer">官方自定义服务商指南 ↗</a> 和 <a href="https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/settings/providers.md" target="_blank" rel="noopener noreferrer">模型服务设置说明 ↗</a>，核对日期：2026-11-01。客户端界面可能随版本变化。</p>
      </>,
    },
    en: { description: "Chat with models on desktop", intro: "Add the platform as a custom provider in Cherry Studio and select a model in Chat.", url: "https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/providers/zi-ding-yi-fu-wu-shang.md",
      steps: <>
        <ol className="steps">
          <li>
            <h4>Install Cherry Studio and open Model Services</h4>
            <p>Get the desktop client for your system from the <a href="https://cherryai.com/" target="_blank" rel="noopener noreferrer">Cherry Studio download page ↗</a>. Install it and open it. From the gear icon, go to <b>Settings → Model Services → + Add Provider</b>.</p>
          </li>
          <li>
            <h4>Add the platform provider and select OpenAI Chat</h4>
            <p>In the custom provider form, enter <b>MoMA</b> as the name. Enter your platform API key. Set the endpoint to <b>OpenAI / OpenAI Chat Completions</b>. Labels can vary by version. Requests must use Chat Completions.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Custom provider settings</span><span>Value</span></div>
              <div className="form-row"><span>Provider name</span><div className="form-value">MoMA</div></div>
              <div className="form-row"><span>Provider type / endpoint</span><div className="form-value">OpenAI · Chat Completions</div></div>
              <div className="form-row"><span>API key</span><div className="form-value">{apiKey}</div></div>
              <div className="form-row"><span>API host / OpenAI endpoint</span>
                <div className="form-value">
                  <div className="copy-cell"><code>{apiHost}</code><ExampleCopy value={apiHost} english />
                  </div>
                </div>
              </div>
            </div>
            <p className="hint">Enter the host without <code>/v1/chat/completions</code>. The OpenAI Chat configuration appends the path. The final URL must be <code>{chatEndpoint}</code>. Enter the API key without the <code>Bearer </code> prefix.</p>
            <div className="callout">This guide uses OpenAI Chat Completions. Keep Use Responses API off if available. Click Add or Save to save the provider.</div>
          </li>
          <li>
            <h4>Add a model from your subscription</h4>
            <p>Select <b>MoMA</b> in the provider list. Under Models, click <b>+ / Add Model</b> and enter the model ID manually.</p>
            <div className="form-guide">
              <div className="guide-title"><span>Add Model</span><span>{modelName} example</span></div>
              <div className="form-row"><span>Model ID</span>
                <div className="form-value"><code>{modelId}</code>
                </div>
              </div>
              <div className="form-row"><span>Model name / display name</span><div className="form-value">{modelName} (customizable)</div></div>
              <div className="form-row"><span>Group</span><div className="form-value">MoMA (optional, if available)</div></div>
            </div>
            <p className="hint">The model ID sets the <code>model</code> value in requests. Keep its capitalization and any prefix. The display name only appears in the list. Do not use it or a <code>mod-…</code> resource ID as the model ID.</p>
            <p>Skip the option to fetch the model list. This guide uses the Chat Completions endpoint. Support for <code>/v1/models</code> is unconfirmed. Save the model and check that it appears under the provider.</p>
          </li>
          <li>
            <h4>Enable the provider and check the connection</h4>
            <p>Turn on the provider using the switch in the upper right. Click <b>Check</b> and select <b>{modelName}</b> to test it. If the client asks for a protocol, select OpenAI Chat.</p>
            <p>If the check fails, test the platform endpoint with the cURL example below. If cURL works, check the final request URL, protocol, and model ID in Cherry Studio.</p>
          </li>
          <li>
            <h4>Select the model and start a chat</h4>
            <p>Return to <b>Chat</b> and start a new topic. In the model selector next to the input box, select <b>MoMA → {modelName}</b>. Send “Hello, please introduce yourself briefly.” Check that the model replies.</p>
            <p>To use the same model with another assistant, select it in that assistant’s model selector. To make it the default, choose it under the same provider in <b>Settings → Default Model</b>.</p>
            <div className="success"><span>Setup is complete when the provider is on, the model appears in the selector, and the model replies. Check model and platform support separately for knowledge bases, images, and tool tasks.</span>
            </div>
          </li>
        </ol>
        <h3>Cherry Studio Troubleshooting</h3>
        <div className="faq">
          <details>
            <summary>Why is the model missing from the list?</summary>
            <p>Check that the provider switch in the upper right is on. Confirm that you added the model with + / Add Model. Saving the API host and key does not add models. If fetching fails, enter the model ID manually.</p>
          </details>
          <details>
            <summary>Why do I get HTTP 404 or a request to /v1/responses?</summary>
            <p>Use <code>{apiHost}</code> as the API host. Select OpenAI Chat and turn off Responses API. Check that the URL does not contain <code>/v1</code> twice and ends in <code>/v1/chat/completions</code>.</p>
          </details>
          <details>
            <summary>Why do I get HTTP 401 or 403, or a model not found error?</summary>
            <p>Check that your key is valid and that you subscribed to the selected model. Use the ID from the request example on the platform model page, such as <code>{modelId}</code>. Do not use the display name or resource ID.</p>
          </details>
          <details>
            <summary>Why does chat work while knowledge bases or images fail?</summary>
            <p>This setup uses Chat Completions. Knowledge bases often need an embeddings endpoint. Image input and tool calling depend on model and platform support. Do not set the chat model as an embedding or image generation model.</p>
          </details>
        </div>
        <p className="hint">See the <a href="https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/providers/zi-ding-yi-fu-wu-shang.md" target="_blank" rel="noopener noreferrer">custom provider guide ↗</a> and <a href="https://github.com/CherryHQ/cherry-studio-docs/blob/main/pre-basic/settings/providers.md" target="_blank" rel="noopener noreferrer">model services settings ↗</a>. Checked on 2026-11-01. The interface can vary by version.</p>
      </>,
    },
  },
];
