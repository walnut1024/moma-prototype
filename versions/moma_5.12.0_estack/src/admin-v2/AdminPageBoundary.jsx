import { Component } from 'react';
import { Banner, Button } from '@douyinfe/semi-ui';

export default class AdminPageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Banner className="semi-native" type="danger" title="页面加载失败" closeIcon={null}
      description={<>当前页面出现异常，可重试或通过侧栏切换到其他页面。 <Button onClick={() => this.setState({ failed: false })}>重试加载</Button></>}/>;
  }
}
