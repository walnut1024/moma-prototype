import { Component } from 'react';
import { Button } from '../components/ui/button';

export default class AdminPageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="ent-panel admin-page-error" role="alert"><h1>页面加载失败</h1><p>当前页面出现异常，可重试或通过侧栏切换到其他页面。</p><Button onClick={() => this.setState({ failed: false })}>重试加载</Button></section>;
  }
}
